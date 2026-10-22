export type DiagramKind = "flowchart" | "erDiagram";

export interface Diagnostic {
  line: number;
  column: number;
  message: string;
}

export type CompileResult =
  | { ok: true; kind: DiagramKind; mermaid: string }
  | { ok: false; diagnostics: Diagnostic[] };

type SourceLine = {
  line: number;
  indent: number;
  text: string;
};

type Color =
  | "yellow"
  | "blue"
  | "gray"
  | "green"
  | "red"
  | "orange"
  | "purple"
  | "pink"
  | "white"
  | "black";

type Shape = "box" | "rounded box" | "circle" | "diamond" | "cylinder";

type FlowNode = {
  name: string;
  line: number;
  color?: Color;
  shape?: Shape;
  mermaidId?: string;
};

type FlowEdge = {
  from: string;
  to: string;
  label?: string;
  line: number;
};

type FlowGroup = {
  name: string;
  line: number;
  children: FlowElement[];
  mermaidId?: string;
};

type FlowElement =
  | { type: "node"; node: FlowNode }
  | { type: "group"; group: FlowGroup };

type FlowModel = {
  elements: FlowElement[];
  nodes: Map<string, FlowNode>;
  edges: FlowEdge[];
};

type EntityField = {
  name: string;
  valueType: string;
  primaryKey: boolean;
  line: number;
};

type Entity = {
  name: string;
  line: number;
  fields: EntityField[];
};

type RelationshipCardinality = "one" | "many" | "zero or one";

type EntityRelationship = {
  from: string;
  to: string;
  cardinality: RelationshipCardinality;
  line: number;
};

type ErModel = {
  entities: Map<string, Entity>;
  relationships: EntityRelationship[];
};

const NAME_PATTERN = String.raw`(?:"(?:[^"\\]|\\.)+"|[A-Za-z_][A-Za-z0-9_-]*)`;

const COLOR_STYLES: Record<Color, { fill: string; text: string }> = {
  yellow: { fill: "#FDE047", text: "#111827" },
  blue: { fill: "#93C5FD", text: "#111827" },
  gray: { fill: "#D1D5DB", text: "#111827" },
  green: { fill: "#86EFAC", text: "#111827" },
  red: { fill: "#FCA5A5", text: "#111827" },
  orange: { fill: "#FDBA74", text: "#111827" },
  purple: { fill: "#D8B4FE", text: "#111827" },
  pink: { fill: "#F9A8D4", text: "#111827" },
  white: { fill: "#FFFFFF", text: "#111827" },
  black: { fill: "#1F2937", text: "#FFFFFF" },
};

const ER_RELATION_RE = new RegExp(
  `^(${NAME_PATTERN})\\s+has\\s+(one|many|zero or one)\\s+(${NAME_PATTERN})$`,
);
const ER_FIELD_RE = /^([A-Za-z_][A-Za-z0-9_-]*):\s*([A-Za-z_][A-Za-z0-9_]*(?:\[\])?)(?:\s+(key))?$/;

/** Compile the v0.1 DSL into portable Mermaid source. */
export function compile(source: string): CompileResult {
  const diagnostics: Diagnostic[] = [];
  const lines = readLines(source, diagnostics);
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  if (lines.length === 0) {
    return { ok: false, diagnostics: [{ line: 1, column: 1, message: "Add at least one diagram statement." }] };
  }

  const isEr = lines.some((line, index) => {
    if (ER_RELATION_RE.test(line.text)) return true;
    return line.indent > 0 && ER_FIELD_RE.test(line.text) && hasEntityHeader(lines, index);
  });

  if (isEr) {
    const model = parseEr(lines, diagnostics);
    if (diagnostics.length > 0 || !model) return { ok: false, diagnostics };
    return { ok: true, kind: "erDiagram", mermaid: emitEr(model) };
  }

  const model = parseFlow(lines, diagnostics);
  if (diagnostics.length > 0 || !model) return { ok: false, diagnostics };
  return { ok: true, kind: "flowchart", mermaid: emitFlow(model) };
}

function readLines(source: string, diagnostics: Diagnostic[]): SourceLine[] {
  const result: SourceLine[] = [];
  for (const [index, raw] of source.replace(/\r\n?/g, "\n").split("\n").entries()) {
    if (/\t/.test(raw)) {
      diagnostics.push({ line: index + 1, column: raw.indexOf("\t") + 1, message: "Use spaces for indentation; tabs are not allowed." });
      continue;
    }

    const withoutLeading = raw.replace(/^ +/, "");
    if (withoutLeading.length === 0 || withoutLeading.startsWith("#")) continue;
    const indent = raw.length - withoutLeading.length;
    if (indent % 2 !== 0) {
      diagnostics.push({ line: index + 1, column: indent + 1, message: "Indentation must use pairs of spaces." });
      continue;
    }
    result.push({ line: index + 1, indent, text: withoutLeading.trimEnd() });
  }
  return result;
}

function hasEntityHeader(lines: SourceLine[], fieldIndex: number): boolean {
  const fieldIndent = lines[fieldIndex].indent;
  if (fieldIndent !== 2) return false;
  const previous = lines[fieldIndex - 1];
  return Boolean(previous && previous.indent === 0 && new RegExp(`^${NAME_PATTERN}:$`).test(previous.text));
}

function parseFlow(lines: SourceLine[], diagnostics: Diagnostic[]): FlowModel | undefined {
  const model: FlowModel = { elements: [], nodes: new Map(), edges: [] };
  const groupStack: FlowGroup[] = [];
  const seenDeclarations = new Set<string>();

  for (const line of lines) {
    const depth = line.indent / 2;
    if (depth > groupStack.length) {
      diagnostics.push({ line: line.line, column: 1, message: "This line is indented without a matching `contains:` group." });
      continue;
    }
    groupStack.length = depth;
    const parentChildren = depth === 0 ? model.elements : groupStack[depth - 1]?.children;
    if (!parentChildren) {
      diagnostics.push({ line: line.line, column: 1, message: "Invalid group indentation." });
      continue;
    }

    const groupMatch = line.text.match(new RegExp(`^(${NAME_PATTERN})\\s+contains:$`));
    if (groupMatch) {
      const name = parseName(groupMatch[1]);
      const group: FlowGroup = { name, line: line.line, children: [] };
      parentChildren.push({ type: "group", group });
      groupStack.push(group);
      continue;
    }

    const edgeMatch = line.text.match(new RegExp(`^(${NAME_PATTERN})\\s*->\\s*(${NAME_PATTERN})(?:\\s*:\\s*(.+))?$`));
    if (edgeMatch) {
      if (depth !== 0) {
        diagnostics.push({ line: line.line, column: 1, message: "Write connections at the top level, outside `contains:` groups." });
        continue;
      }
      const from = parseName(edgeMatch[1]);
      const to = parseName(edgeMatch[2]);
      const label = edgeMatch[3]?.trim();
      if (edgeMatch[3] !== undefined && !label) {
        diagnostics.push({ line: line.line, column: line.text.indexOf(":") + 2, message: "An edge label cannot be empty." });
        continue;
      }
      ensureFlowNode(model, from, line.line, parentChildren);
      ensureFlowNode(model, to, line.line, parentChildren);
      model.edges.push({ from, to, label, line: line.line });
      continue;
    }

    const styleMatch = line.text.match(new RegExp(`^(${NAME_PATTERN})\\s+is a\\s+([A-Za-z]+)\\s+(box|rounded box|circle|diamond|cylinder)$`));
    if (styleMatch) {
      const name = parseName(styleMatch[1]);
      const color = styleMatch[2].toLowerCase() as Color;
      const shape = styleMatch[3] as Shape;
      if (!(color in COLOR_STYLES)) {
        diagnostics.push({ line: line.line, column: line.text.indexOf(styleMatch[2]) + 1, message: `Unknown color "${styleMatch[2]}". Choose one of: ${Object.keys(COLOR_STYLES).join(", " )}.` });
        continue;
      }
      const key = identity(name);
      const node = model.nodes.get(key) ?? ensureFlowNode(model, name, line.line, parentChildren);
      if (seenDeclarations.has(`style:${key}`)) {
        diagnostics.push({ line: line.line, column: 1, message: `"${name}" already has an appearance statement.` });
        continue;
      }
      seenDeclarations.add(`style:${key}`);
      if (depth > 0) {
        removeNodeElement(model.elements, node);
        parentChildren.push({ type: "node", node });
      }
      node.color = color;
      node.shape = shape;
      continue;
    }

    diagnostics.push({
      line: line.line,
      column: 1,
      message: "Expected a connection (`A -> B`), an appearance (`A is a yellow box`), or a group (`A contains:`).",
    });
  }

  if (model.nodes.size === 0 && diagnostics.length === 0) {
    diagnostics.push({ line: lines[0]?.line ?? 1, column: 1, message: "A flow diagram needs at least one node or connection." });
  }
  validateGroups(model.elements, diagnostics);
  assignFlowIds(model);
  return diagnostics.length === 0 ? model : undefined;
}

function ensureFlowNode(model: FlowModel, name: string, line: number, parent: FlowElement[]): FlowNode {
  const key = identity(name);
  const found = model.nodes.get(key);
  if (found) return found;
  const node: FlowNode = { name, line };
  model.nodes.set(key, node);
  parent.push({ type: "node", node });
  return node;
}

function removeNodeElement(elements: FlowElement[], target: FlowNode): void {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (element.type === "node" && element.node === target) {
      elements.splice(index, 1);
    } else if (element.type === "group") {
      removeNodeElement(element.group.children, target);
    }
  }
}

function validateGroups(elements: FlowElement[], diagnostics: Diagnostic[]): void {
  for (const element of elements) {
    if (element.type === "group") {
      if (element.group.children.length === 0) {
        diagnostics.push({ line: element.group.line, column: 1, message: `Group "${element.group.name}" cannot be empty.` });
      }
      validateGroups(element.group.children, diagnostics);
    }
  }
}

function assignFlowIds(model: FlowModel): void {
  const nodeIds = new Set<string>();
  for (const node of model.nodes.values()) node.mermaidId = uniqueId("n", node.name, nodeIds);

  const groupIds = new Set<string>();
  const assignGroups = (elements: FlowElement[]): void => {
    for (const element of elements) {
      if (element.type === "group") {
        element.group.mermaidId = uniqueId("g", element.group.name, groupIds);
        assignGroups(element.group.children);
      }
    }
  };
  assignGroups(model.elements);
}

function emitFlow(model: FlowModel): string {
  const output = ["flowchart LR"];
  const emitElements = (elements: FlowElement[], depth: number): void => {
    const pad = "  ".repeat(depth);
    for (const element of elements) {
      if (element.type === "group") {
        const group = element.group;
        output.push(`${pad}subgraph ${group.mermaidId}["${escapeMermaidText(group.name)}"]`);
        emitElements(group.children, depth + 1);
        output.push(`${pad}end`);
      } else {
        const node = element.node;
        output.push(`${pad}${node.mermaidId}${shapeSyntax(node.shape ?? "box", node.name)}`);
        if (node.color) {
          const style = COLOR_STYLES[node.color];
          output.push(`${pad}style ${node.mermaidId} fill:${style.fill},stroke:#374151,color:${style.text}`);
        }
      }
    }
  };
  emitElements(model.elements, 0);

  for (const edge of model.edges) {
    const from = model.nodes.get(identity(edge.from))?.mermaidId;
    const to = model.nodes.get(identity(edge.to))?.mermaidId;
    if (!from || !to) continue;
    const label = edge.label ? `|${escapeMermaidText(edge.label)}|` : "";
    output.push(`  ${from} -->${label} ${to}`);
  }
  return output.join("\n");
}

function shapeSyntax(shape: Shape, label: string): string {
  const escaped = `"${escapeMermaidText(label)}"`;
  switch (shape) {
    case "rounded box": return `(${escaped})`;
    case "circle": return `((${escaped}))`;
    case "diamond": return `{${escaped}}`;
    case "cylinder": return `[(${escaped})]`;
    case "box": return `[${escaped}]`;
  }
}

function parseEr(lines: SourceLine[], diagnostics: Diagnostic[]): ErModel | undefined {
  const model: ErModel = { entities: new Map(), relationships: [] };
  let currentEntity: Entity | undefined;

  for (const line of lines) {
    const relationMatch = line.indent === 0 ? line.text.match(ER_RELATION_RE) : null;
    if (relationMatch) {
      currentEntity = undefined;
      model.relationships.push({
        from: parseName(relationMatch[1]),
        cardinality: relationMatch[2] as RelationshipCardinality,
        to: parseName(relationMatch[3]),
        line: line.line,
      });
      continue;
    }

    const entityMatch = line.indent === 0 ? line.text.match(new RegExp(`^(${NAME_PATTERN}):$`)) : null;
    if (entityMatch) {
      const name = parseName(entityMatch[1]);
      const key = identity(name);
      if (model.entities.has(key)) {
        diagnostics.push({ line: line.line, column: 1, message: `Entity "${name}" is declared more than once.` });
        currentEntity = model.entities.get(key);
      } else {
        currentEntity = { name, line: line.line, fields: [] };
        model.entities.set(key, currentEntity);
      }
      continue;
    }

    if (line.indent === 2) {
      const fieldMatch = line.text.match(ER_FIELD_RE);
      if (!fieldMatch) {
        diagnostics.push({ line: line.line, column: 1, message: "Expected a field in the form `name: type` or `name: type key`." });
        continue;
      }
      if (!currentEntity) {
        diagnostics.push({ line: line.line, column: 1, message: "A field must be indented under an entity declaration such as `User:`." });
        continue;
      }
      if (currentEntity.fields.some((field) => field.name.toLowerCase() === fieldMatch[1].toLowerCase())) {
        diagnostics.push({ line: line.line, column: 1, message: `Field "${fieldMatch[1]}" is already declared on "${currentEntity.name}".` });
        continue;
      }
      currentEntity.fields.push({
        name: fieldMatch[1],
        valueType: fieldMatch[2],
        primaryKey: fieldMatch[3] === "key",
        line: line.line,
      });
      continue;
    }

    diagnostics.push({
      line: line.line,
      column: 1,
      message: "ER diagrams use entity headers (`User:`), indented fields, and `A has many B` relationships; flow statements cannot be mixed in.",
    });
  }

  for (const entity of model.entities.values()) {
    if (entity.fields.length === 0) {
      diagnostics.push({ line: entity.line, column: 1, message: `Entity "${entity.name}" must declare at least one field.` });
    }
    const primaryKeys = entity.fields.filter((field) => field.primaryKey);
    if (primaryKeys.length > 1) {
      diagnostics.push({ line: primaryKeys[1].line, column: 1, message: `Entity "${entity.name}" has more than one primary key; composite keys are not supported in v0.1.` });
    }
  }

  for (const relationship of model.relationships) {
    const from = model.entities.get(identity(relationship.from));
    const to = model.entities.get(identity(relationship.to));
    if (!from) diagnostics.push({ line: relationship.line, column: 1, message: `Unknown entity "${relationship.from}" in relationship.` });
    if (!to) diagnostics.push({ line: relationship.line, column: 1, message: `Unknown entity "${relationship.to}" in relationship.` });
  }

  if (model.entities.size === 0 && diagnostics.length === 0) {
    diagnostics.push({ line: lines[0]?.line ?? 1, column: 1, message: "An ER diagram needs at least one entity." });
  }
  if (diagnostics.length > 0) return undefined;

  return model;
}

function emitEr(model: ErModel): string {
  const output = ["erDiagram"];
  for (const entity of model.entities.values()) {
    const entityName = mermaidEntityName(entity.name);
    output.push(`  ${entityName} {`);
    for (const field of entity.fields) {
      output.push(`    ${field.valueType} ${field.name}${field.primaryKey ? " PK" : ""}`);
    }
    output.push("  }");
  }

  for (const relationship of model.relationships) {
    const fromEntity = model.entities.get(identity(relationship.from));
    const toEntity = model.entities.get(identity(relationship.to));
    if (!fromEntity || !toEntity) continue;
    const right = relationship.cardinality === "one" ? "||" : relationship.cardinality === "many" ? "o{" : "o|";
    output.push(`  ${mermaidEntityName(fromEntity.name)} ||--${right} ${mermaidEntityName(toEntity.name)} : ${relationship.cardinality === "zero or one" ? "has zero or one" : `has ${relationship.cardinality}`}`);
  }
  return output.join("\n");
}

function mermaidEntityName(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  return `"${escapeMermaidText(name)}"`;
}

function parseName(value: string): string {
  if (!value.startsWith("\"")) return value;
  try {
    return JSON.parse(value) as string;
  } catch {
    return value.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  }
}

function identity(value: string): string {
  return value.toLowerCase();
}

function uniqueId(prefix: string, name: string, used: Set<string>): string {
  const stem = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "item";
  let candidate = `${prefix}_${stem}`;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${prefix}_${stem}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

function escapeMermaidText(value: string): string {
  return value
    .replace(/&/g, "#amp;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/\|/g, "#124;")
    .replace(/\[/g, "#91;")
    .replace(/\]/g, "#93;")
    .replace(/[\r\n]/g, " ");
}
