import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../dist/index.js";

function good(source, kind) {
  const result = compile(source);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.kind, kind);
  return result.mermaid;
}

function bad(source, message) {
  const result = compile(source);
  assert.equal(result.ok, false, JSON.stringify(result));
  if (message) assert.match(result.diagnostics.map((item) => item.message).join("\n"), message);
  assert.ok(result.diagnostics.every((item) => item.line > 0 && item.column > 0));
}

test("v0.1 flow output remains deterministic", () => {
  const source = "ArgoCD -> GitHub: deploy\nArgoCD is a yellow box\nGitHub is a gray box";
  const expected = [
    "flowchart LR",
    'n_argocd["ArgoCD"]',
    "style n_argocd fill:#FDE047,stroke:#374151,color:#111827",
    'n_github["GitHub"]',
    "style n_github fill:#D1D5DB,stroke:#374151,color:#111827",
    "  n_argocd -->|deploy| n_github",
  ].join("\n");
  assert.equal(good(source, "flowchart"), expected);
  assert.equal(good(source, "flowchart"), expected);
});

test("ER entities and relationships compile", () => {
  const output = good("User:\n  id: number key\nPosts:\n  id: number\nUser has many Posts", "erDiagram");
  assert.match(output, /erDiagram/);
  assert.match(output, /number id PK/);
  assert.match(output, /User \|\|--o\{ Posts : "has many"/);
});

test("flow arrows expose a small fixed set of connection styles", () => {
  const output = good("A -> B: normal\nB ..> C: optional\nC ==> D: critical\nD <-> A: sync", "flowchart");
  assert.match(output, /-->\|normal\|/);
  assert.match(output, /-\.->\|optional\|/);
  assert.match(output, /==>\|critical\|/);
  assert.match(output, /<-->\|sync\|/);
});

test("ER supports composite primary keys and validated foreign references", () => {
  const output = good("User:\n  tenant_id: number key\n  id: number key\nPost:\n  id: number key\n  author_id: number references User.id\n  slug: text unique\n  nickname: text?", "erDiagram");
  assert.match(output, /number tenant_id PK/);
  assert.match(output, /number author_id FK/);
  assert.match(output, /text slug UK/);
  assert.match(output, /text\? nickname/);
  bad("User:\n  id: number key\nPost:\n  id: number key\n  author_id: number references User.missing", /Unknown field/);
});

test("quoted names accept escaped quotes and reject invalid escapes", () => {
  const output = good('"Build \\"API\\"" -> Deploy', "flowchart");
  assert.match(output, /Build/);
  bad('"bad\\q" -> API', /Expected a connection/);
  bad('"bad\\t" -> API', /Expected a connection/);
  bad('"bad\\u0000" -> API', /Expected a connection/);
});

test("raw control characters return diagnostics instead of leaking to Mermaid", () => {
  bad("A -> B\u0000", /Control characters/);
  bad("A\t-> B", /tabs are not allowed/);
});

test("sequence diagram preserves message order and direction", () => {
  const output = good("sequence:\n  Browser -> API: request\n  API -->> Browser: response", "sequenceDiagram");
  assert.match(output, /^sequenceDiagram/m);
  assert.ok(output.indexOf(": request") < output.indexOf(": response"));
  assert.match(output, /p_api-->>p_browser: response/);
});

test("state diagram supports initial and final markers", () => {
  const output = good("state:\n  start -> Idle: boot\n  Idle -> Busy: begin\n  Busy -> end: finish", "stateDiagram-v2");
  assert.match(output, /\[\*\] --> s_idle : boot/);
  assert.match(output, /s_busy --> \[\*\] : finish/);
});

test("class diagram supports fields and inheritance", () => {
  const output = good("class:\n  User has id: number\n  Admin extends User", "classDiagram");
  assert.match(output, /class c_user\["User"\] \{\n    \+number id/);
  assert.match(output, /c_admin --\|> c_user/);
});

test("mind map supports nested children", () => {
  const output = good("mindmap:\n  Product\n    Editor\n      Preview\n    Compiler", "mindmap");
  assert.match(output, /root\(\(Product\)\)/);
  assert.match(output, /\n      Preview/);
});

test("pie chart validates numeric slices", () => {
  assert.match(good("pie:\n  Chrome: 65\n  Firefox: 35", "pie"), /"Chrome" : 65/);
  bad("pie:\n  Chrome: -2", /Expected a slice/);
  bad(`pie:\n  Chrome: ${"9".repeat(400)}`, /finite numbers/);
});

test("gantt chart validates dates and computes inclusive duration", () => {
  const output = good("gantt:\n  title: Release\n  Design: 2026-10-01 to 2026-10-03", "gantt");
  assert.match(output, /Design :task_design, 2026-10-01, 3d/);
  bad("gantt:\n  Build: 2026-02-30 to 2026-03-01", /valid dates/);
  bad("gantt:\n  Build: 2026-03-02 to 2026-03-01", /valid dates/);
});

test("timeline and journey compile their ordered entries", () => {
  assert.match(good("timeline:\n  title: Releases\n  2025: First release\n  2026: Stable", "timeline"), /2025 : First release[\s\S]*2026 : Stable/);
  const journey = good("journey:\n  title: Setup\n  Discover contains:\n    Read docs: 4 by User\n  Install contains:\n    Run installer: 5 by User", "journey");
  assert.match(journey, /section Discover[\s\S]*Read docs: 4: User[\s\S]*section Install/);
  bad('journey:\n  "Build \\q" contains:\n    Read docs: 3 by User', /Quoted labels/);
});

test("quadrant chart constrains coordinates to zero through one", () => {
  const output = good("quadrant:\n  title: Priorities\n  x-axis: Effort to Value\n  y-axis: Risk to Impact\n  Quick win: 0.2, 0.9", "quadrantChart");
  assert.match(output, /"Quick win": \[0.2, 0.9\]/);
  bad("quadrant:\n  Work: 2, 0.5", /coordinates from 0 to 1/);
  bad('quadrant:\n  "Build \\q": 0.2, 0.8', /Quoted labels/);
});

test("declared blocks require indented statements and never throw for malformed text", () => {
  bad("sequence:\nBrowser -> API: request", /indented by two spaces/);
  for (const source of ["mindmap:\n  \"unterminated", String.raw`class:
  "\q" has field: type`, "journey:\n  Section contains:\n    nope"]) {
    assert.doesNotThrow(() => compile(source));
    assert.equal(compile(source).ok, false);
  }
});
