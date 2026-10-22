import type { DiagramKind, Diagnostic, SourceLine } from "./index.js";

type DeclaredKind = "sequence" | "state" | "class" | "mindmap" | "pie" | "gantt" | "timeline" | "journey" | "quadrant";
type DeclaredResult = { ok: true; kind: DiagramKind; mermaid: string } | { ok: false; diagnostics: Diagnostic[] };

const NAME = String.raw`(?:"(?:[^"\\\u0000-\u001F]|\\["\\])+"|[A-Za-z_][A-Za-z0-9_-]*)`;

export function compileDeclaredDiagram(kind: string, lines: SourceLine[]): DeclaredResult {
  const diagnostics: Diagnostic[] = [];
  if (lines.length === 0) return fail(1, "A diagram block cannot be empty.");
  const declaredKind = kind as DeclaredKind;
  let mermaid: string | undefined;
  switch (declaredKind) {
    case "sequence": mermaid = compileSequence(lines, diagnostics); break;
    case "state": mermaid = compileState(lines, diagnostics); break;
    case "class": mermaid = compileClass(lines, diagnostics); break;
    case "mindmap": mermaid = compileMindmap(lines, diagnostics); break;
    case "pie": mermaid = compilePie(lines, diagnostics); break;
    case "gantt": mermaid = compileGantt(lines, diagnostics); break;
    case "timeline": mermaid = compileTimeline(lines, diagnostics); break;
    case "journey": mermaid = compileJourney(lines, diagnostics); break;
    case "quadrant": mermaid = compileQuadrant(lines, diagnostics); break;
    default: return fail(lines[0].line, `Unknown diagram type "${kind}".`);
  }
  return diagnostics.length || !mermaid
    ? { ok: false, diagnostics }
    : { ok: true, kind: mermaidKind(declaredKind), mermaid };
}

function compileSequence(lines: SourceLine[], diagnostics: Diagnostic[]): string | undefined {
  const messages: Array<{ from: string; to: string; arrow: string; text: string; line: number }> = [];
  const participants = new Map<string, string>();
  const message = new RegExp(`^(${NAME})\\s+(-->>|->>|-->|->)\\s+(${NAME}):\\s*(.+)$`);
  for (const line of lines) {
    if (line.indent !== 0) {
      diagnostics.push(diag(line, "Sequence messages must all be at the same indentation level."));
      continue;
    }
    const match = line.text.match(message);
    if (!match) {
      diagnostics.push(diag(line, "Expected a message such as `Browser -> API: request`."));
      continue;
    }
    const from = readName(match[1]);
    const to = readName(match[3]);
    const text = match[4].trim();
    if (!text) {
      diagnostics.push(diag(line, "A sequence message needs a label."));
      continue;
    }
    participants.set(identity(from), from);
    participants.set(identity(to), to);
    messages.push({ from, to, arrow: match[2], text, line: line.line });
  }
  if (!messages.length && !diagnostics.length) diagnostics.push(diag(lines[0], "A sequence diagram needs at least one message."));
  if (diagnostics.length) return undefined;
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const [key, name] of participants) ids.set(key, uniqueId("p", name, used));
  const output = ["sequenceDiagram"];
  for (const [key, name] of participants) output.push(`  participant ${ids.get(key)} as ${escapeText(name)}`);
  for (const item of messages) {
    output.push(`  ${ids.get(identity(item.from))}${item.arrow}${ids.get(identity(item.to))}: ${escapeText(item.text)}`);
  }
  return output.join("\n");
}

function compileState(lines: SourceLine[], diagnostics: Diagnostic[]): string | undefined {
  const edges: Array<{ from: string; to: string; label?: string; line: number }> = [];
  const states = new Map<string, string>();
  const edge = new RegExp(`^(${NAME})\\s*->\\s*(${NAME})(?:\\s*:\\s*(.+))?$`);
  for (const line of lines) {
    if (line.indent !== 0) {
      diagnostics.push(diag(line, "State transitions must all be at the same indentation level."));
      continue;
    }
    const match = line.text.match(edge);
    if (!match) {
      diagnostics.push(diag(line, "Expected a transition such as `Idle -> Loading: start`."));
      continue;
    }
    const from = readName(match[1]);
    const to = readName(match[2]);
    for (const name of [from, to]) {
      if (!isStateMarker(name)) states.set(identity(name), name);
    }
    edges.push({ from, to, label: match[3]?.trim(), line: line.line });
  }
  if (!edges.length && !diagnostics.length) diagnostics.push(diag(lines[0], "A state diagram needs at least one transition."));
  if (diagnostics.length) return undefined;
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const [key, name] of states) ids.set(key, uniqueId("s", name, used));
  const output = ["stateDiagram-v2"];
  for (const [key, name] of states) output.push(`  state "${escapeText(name)}" as ${ids.get(key)}`);
  for (const item of edges) {
    const from = isStateMarker(item.from) ? "[*]" : ids.get(identity(item.from));
    const to = isStateMarker(item.to) ? "[*]" : ids.get(identity(item.to));
    output.push(`  ${from} --> ${to}${item.label ? ` : ${escapeText(item.label)}` : ""}`);
  }
  return output.join("\n");
}

function compileClass(lines: SourceLine[], diagnostics: Diagnostic[]): string | undefined {
  const classes = new Map<string, { name: string; fields: string[] }>();
  const relations: Array<{ child: string; parent: string; kind: "extends" | "implements"; line: number }> = [];
  const field = new RegExp(`^(${NAME})\\s+has\\s+([A-Za-z_][A-Za-z0-9_-]*):\\s*([A-Za-z_][A-Za-z0-9_]*(?:\\[\\])?)$`);
  const relation = new RegExp(`^(${NAME})\\s+(extends|implements)\\s+(${NAME})$`);
  const ensure = (name: string) => {
    const key = identity(name);
    if (!classes.has(key)) classes.set(key, { name, fields: [] });
    return classes.get(key)!;
  };
  for (const line of lines) {
    if (line.indent !== 0) {
      diagnostics.push(diag(line, "Class declarations must all be at the same indentation level."));
      continue;
    }
    const fieldMatch = line.text.match(field);
    const relationMatch = line.text.match(relation);
    if (fieldMatch) {
      const name = readName(fieldMatch[1]);
      const entry = ensure(name);
      const member = `+${fieldMatch[3]} ${fieldMatch[2]}`;
      if (entry.fields.includes(member)) diagnostics.push(diag(line, `Member "${fieldMatch[2]}" is already declared on "${name}".`));
      else entry.fields.push(member);
    } else if (relationMatch) {
      const child = readName(relationMatch[1]);
      const parent = readName(relationMatch[3]);
      ensure(child); ensure(parent);
      relations.push({ child, parent, kind: relationMatch[2] as "extends" | "implements", line: line.line });
    } else {
      diagnostics.push(diag(line, "Expected `Class has field: type`, `Child extends Parent`, or `Class implements Interface`."));
    }
  }
  if (!classes.size && !diagnostics.length) diagnostics.push(diag(lines[0], "A class diagram needs at least one class."));
  if (diagnostics.length) return undefined;
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const [key, item] of classes) ids.set(key, uniqueId("c", item.name, used));
  const output = ["classDiagram"];
  for (const [key, item] of classes) {
    const id = ids.get(key)!;
    if (item.fields.length) {
      output.push(`  class ${id}["${escapeText(item.name)}"] {`);
      for (const member of item.fields) output.push(`    ${member}`);
      output.push("  }");
    } else output.push(`  class ${id}["${escapeText(item.name)}"]`);
  }
  for (const item of relations) {
    const arrow = item.kind === "extends" ? "--|>" : "..|>";
    output.push(`  ${ids.get(identity(item.child))} ${arrow} ${ids.get(identity(item.parent))}`);
  }
  return output.join("\n");
}

function compileMindmap(lines: SourceLine[], diagnostics: Diagnostic[]): string | undefined {
  for (const line of lines) {
    if (!new RegExp(`^${NAME}$`).test(line.text)) diagnostics.push(diag(line, "Mind map items must be names, quoted when they contain spaces."));
  }
  if (diagnostics.length) return undefined;
  if (lines[0].indent !== 0) diagnostics.push(diag(lines[0], "A mind map must start with one unindented root."));
  const roots = lines.filter((line) => line.indent === 0);
  if (roots.length !== 1) diagnostics.push(diag(roots[1] ?? lines[0], "A mind map must have exactly one root."));
  if (diagnostics.length) return undefined;
  const output = ["mindmap", `  root((${escapeText(readName(roots[0].text))}))`];
  const stack = [{ indent: 0, name: readName(roots[0].text) }];
  for (const line of lines.slice(1)) {
    if (line.indent > stack[stack.length - 1].indent + 2) {
      diagnostics.push(diag(line, "Indentation can only increase by one level at a time."));
      continue;
    }
    while (stack.length && line.indent <= stack[stack.length - 1].indent) stack.pop();
    const depth = stack.length + 1;
    output.push(`${"  ".repeat(depth)}${escapeText(readName(line.text))}`);
    stack.push({ indent: line.indent, name: line.text });
  }
  return diagnostics.length ? undefined : output.join("\n");
}

function compilePie(lines: SourceLine[], diagnostics: Diagnostic[]): string | undefined {
  const slices: Array<{ name: string; value: number; line: number }> = [];
  const slicePattern = new RegExp(`^(${NAME}):\\s*(\\d+(?:\\.\\d+)?)$`);
  for (const line of lines) {
    if (line.indent !== 0) { diagnostics.push(diag(line, "Pie slices must all be at the same indentation level.")); continue; }
    const match = line.text.match(slicePattern);
    if (!match) { diagnostics.push(diag(line, "Expected a slice such as `Chrome: 65`.")); continue; }
    const value = Number(match[2]);
    if (!Number.isFinite(value)) {
      diagnostics.push(diag(line, "Pie slice values must be finite numbers."));
      continue;
    }
    slices.push({ name: readName(match[1]), value, line: line.line });
  }
  if (!slices.length && !diagnostics.length) diagnostics.push(diag(lines[0], "A pie chart needs at least one slice."));
  if (diagnostics.length) return undefined;
  return ["pie showData", ...slices.map(({ name, value }) => `  "${escapeText(name)}" : ${value}`)].join("\n");
}

function compileGantt(lines: SourceLine[], diagnostics: Diagnostic[]): string | undefined {
  let title = "Project plan";
  let hasTitle = false;
  const tasks: Array<{ name: string; start: string; end: string; line: SourceLine }> = [];
  const taskPattern = new RegExp(`^(${NAME}):\\s*(\\d{4}-\\d{2}-\\d{2})\\s+to\\s+(\\d{4}-\\d{2}-\\d{2})$`);
  for (const line of lines) {
    if (line.indent !== 0) { diagnostics.push(diag(line, "Gantt statements must all be at the same indentation level.")); continue; }
    const titleMatch = line.text.match(/^title:\s*(.+)$/);
    const task = line.text.match(taskPattern);
    if (titleMatch) {
      if (hasTitle) diagnostics.push(diag(line, "A Gantt chart can have only one title."));
      else { title = titleMatch[1].trim(); hasTitle = true; }
    } else if (task) {
      if (!validDate(task[2]) || !validDate(task[3]) || task[2] > task[3]) {
        diagnostics.push(diag(line, "Use valid dates in ascending order: `Task: YYYY-MM-DD to YYYY-MM-DD`."));
      } else tasks.push({ name: readName(task[1]), start: task[2], end: task[3], line });
    } else diagnostics.push(diag(line, "Expected `title: ...` or `Task: YYYY-MM-DD to YYYY-MM-DD`."));
  }
  if (!tasks.length && !diagnostics.length) diagnostics.push(diag(lines[0], "A Gantt chart needs at least one task."));
  if (diagnostics.length) return undefined;
  const used = new Set<string>();
  const output = ["gantt", `  title ${escapeText(title)}`, "  dateFormat YYYY-MM-DD", "  section Plan"];
  for (const task of tasks) {
    const id = uniqueId("task", task.name, used);
    const days = Math.round((Date.parse(`${task.end}T00:00:00Z`) - Date.parse(`${task.start}T00:00:00Z`)) / 86_400_000) + 1;
    output.push(`  ${escapeText(task.name)} :${id}, ${task.start}, ${days}d`);
  }
  return output.join("\n");
}

function compileTimeline(lines: SourceLine[], diagnostics: Diagnostic[]): string | undefined {
  let title: string | undefined;
  const events: Array<{ year: string; text: string; line: SourceLine }> = [];
  for (const line of lines) {
    if (line.indent !== 0) { diagnostics.push(diag(line, "Timeline events must all be at the same indentation level.")); continue; }
    const titleMatch = line.text.match(/^title:\s*(.+)$/);
    const event = line.text.match(/^(\d{4}):\s*(.+)$/);
    if (titleMatch) {
      if (title) diagnostics.push(diag(line, "A timeline can have only one title."));
      else title = titleMatch[1].trim();
    } else if (event) events.push({ year: event[1], text: event[2].trim(), line });
    else diagnostics.push(diag(line, "Expected `YYYY: event` or an optional `title: ...`."));
  }
  if (!events.length && !diagnostics.length) diagnostics.push(diag(lines[0], "A timeline needs at least one event."));
  if (diagnostics.length) return undefined;
  return ["timeline", ...(title ? [`  title ${escapeText(title)}`] : []), ...events.map((event) => `  ${event.year} : ${escapeText(event.text)}`)].join("\n");
}

function compileJourney(lines: SourceLine[], diagnostics: Diagnostic[]): string | undefined {
  let title = "User journey";
  let titleSet = false;
  let section: { name: string; tasks: Array<{ name: string; score: number; actor: string; line: SourceLine }> } | undefined;
  const sections: NonNullable<typeof section>[] = [];
  const taskPattern = new RegExp(`^(.+?):\\s*([1-5])\\s+by\\s+(${NAME})$`);
  for (const line of lines) {
    if (line.indent === 0) {
      const titleMatch = line.text.match(/^title:\s*(.+)$/);
      const sectionMatch = line.text.match(/^(.+?)\s+contains:$/);
      if (titleMatch) {
        if (titleSet) diagnostics.push(diag(line, "A journey can have only one title."));
        else { title = titleMatch[1].trim(); titleSet = true; }
      } else if (sectionMatch) {
        section = { name: readLabel(sectionMatch[1], line, diagnostics), tasks: [] };
        sections.push(section);
      } else diagnostics.push(diag(line, "Expected `title: ...` or a section such as `Discover contains:`."));
    } else if (line.indent === 2) {
      const task = line.text.match(taskPattern);
      if (!task) { diagnostics.push(diag(line, "Expected a task such as `Read docs: 3 by User`.")); continue; }
      if (!section) { diagnostics.push(diag(line, "A task must be inside a `contains:` section.")); continue; }
      section.tasks.push({ name: readLabel(task[1], line, diagnostics), score: Number(task[2]), actor: readName(task[3]), line });
    } else diagnostics.push(diag(line, "Journey tasks must be indented exactly two spaces under a section."));
  }
  for (const item of sections) if (!item.tasks.length) diagnostics.push({ line: lines[0].line, column: 1, message: `Section "${item.name}" must contain at least one task.` });
  if (!sections.length && !diagnostics.length) diagnostics.push(diag(lines[0], "A journey needs at least one section."));
  if (diagnostics.length) return undefined;
  const output = ["journey", `  title ${escapeText(title)}`];
  for (const item of sections) {
    output.push(`  section ${escapeText(item.name)}`);
    for (const task of item.tasks) output.push(`    ${escapeText(task.name)}: ${task.score}: ${escapeText(task.actor)}`);
  }
  return output.join("\n");
}

function compileQuadrant(lines: SourceLine[], diagnostics: Diagnostic[]): string | undefined {
  let title = "Quadrant chart";
  let xAxis = ["Low", "High"];
  let yAxis = ["Low", "High"];
  let titleSet = false;
  let xSet = false;
  let ySet = false;
  const items: Array<{ name: string; x: number; y: number; line: SourceLine }> = [];
  const itemPattern = /^(.+?):\s*(0(?:\.\d+)?|1(?:\.0+)?),\s*(0(?:\.\d+)?|1(?:\.0+)?)$/;
  for (const line of lines) {
    if (line.indent !== 0) { diagnostics.push(diag(line, "Quadrant statements must all be at the same indentation level.")); continue; }
    const titleMatch = line.text.match(/^title:\s*(.+)$/);
    const xMatch = line.text.match(/^x-axis:\s*(.+?)\s+to\s+(.+)$/);
    const yMatch = line.text.match(/^y-axis:\s*(.+?)\s+to\s+(.+)$/);
    const item = line.text.match(itemPattern);
    if (titleMatch) {
      if (titleSet) diagnostics.push(diag(line, "A quadrant chart can have only one title."));
      else { title = titleMatch[1].trim(); titleSet = true; }
    } else if (xMatch) {
      if (xSet) diagnostics.push(diag(line, "A quadrant chart can have only one x-axis."));
      else { xAxis = [xMatch[1].trim(), xMatch[2].trim()]; xSet = true; }
    } else if (yMatch) {
      if (ySet) diagnostics.push(diag(line, "A quadrant chart can have only one y-axis."));
      else { yAxis = [yMatch[1].trim(), yMatch[2].trim()]; ySet = true; }
    } else if (item) items.push({ name: readLabel(item[1], line, diagnostics), x: Number(item[2]), y: Number(item[3]), line });
    else diagnostics.push(diag(line, "Expected `title: ...`, axis labels, or `Name: x, y` coordinates from 0 to 1."));
  }
  if (!items.length && !diagnostics.length) diagnostics.push(diag(lines[0], "A quadrant chart needs at least one item."));
  if (diagnostics.length) return undefined;
  return ["quadrantChart", `  title ${escapeText(title)}`, `  x-axis ${escapeText(xAxis[0])} --> ${escapeText(xAxis[1])}`, `  y-axis ${escapeText(yAxis[0])} --> ${escapeText(yAxis[1])}`, "  quadrant-1 High / high", "  quadrant-2 Low / high", "  quadrant-3 Low / low", "  quadrant-4 High / low", ...items.map((item) => `  "${escapeText(item.name)}": [${item.x}, ${item.y}]`)].join("\n");
}

function mermaidKind(kind: DeclaredKind): DiagramKind {
  const kinds: Record<DeclaredKind, DiagramKind> = {
    sequence: "sequenceDiagram", state: "stateDiagram-v2", class: "classDiagram", mindmap: "mindmap", pie: "pie", gantt: "gantt", timeline: "timeline", journey: "journey", quadrant: "quadrantChart",
  };
  return kinds[kind];
}

function diag(line: SourceLine, message: string): Diagnostic {
  return { line: line.line, column: 1, message };
}

function fail(line: number, message: string): DeclaredResult {
  return { ok: false, diagnostics: [{ line, column: 1, message }] };
}

function readName(source: string): string {
  return source.startsWith('"') ? JSON.parse(source) as string : source;
}

function readLabel(source: string, line: SourceLine, diagnostics: Diagnostic[]): string {
  const value = source.trim();
  if (!value.startsWith('"')) return value;
  if (!new RegExp(`^${NAME}$`).test(value)) {
    diagnostics.push(diag(line, 'Quoted labels only allow \\" and \\\\ escapes.'));
    return "";
  }
  return readName(value);
}

function identity(value: string): string {
  return value.toLowerCase();
}

function uniqueId(prefix: string, name: string, used: Set<string>): string {
  const stem = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";
  let id = `${prefix}_${stem}`;
  let suffix = 2;
  while (used.has(id)) id = `${prefix}_${stem}_${suffix++}`;
  used.add(id);
  return id;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "#amp;").replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;").replace(/\|/g, "#124;").replace(/\[/g, "#91;").replace(/\]/g, "#93;").replace(/[\r\n]/g, " ");
}

function isStateMarker(value: string): boolean {
  return value.toLowerCase() === "start" || value.toLowerCase() === "end";
}

function validDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
