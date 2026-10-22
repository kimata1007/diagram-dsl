import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { compile } from "../dist/index.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://diagram-dsl.test" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
await import("dompurify");
const mermaid = (await import("mermaid")).default;
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

const examples = [
  ["flowchart", "ArgoCD -> GitHub: deploy\nArgoCD is a yellow box"],
  ["ER", "User:\n  id: number key\nPost:\n  id: number key\n  author_id: number references User.id\nUser has many Post"],
  ["sequence", "sequence:\n  Browser -> API: request\n  API -->> Browser: response"],
  ["state", "state:\n  start -> Idle: boot\n  Idle -> Busy: begin\n  Busy -> end: finish"],
  ["class", "class:\n  User has id: number\n  Admin extends User"],
  ["mindmap", "mindmap:\n  Product\n    Editor\n      Preview\n    Compiler"],
  ["pie", "pie:\n  Chrome: 65\n  Firefox: 35"],
  ["gantt", "gantt:\n  title: Release\n  Design: 2026-10-01 to 2026-10-03"],
  ["timeline", "timeline:\n  title: Releases\n  2025: First release"],
  ["journey", "journey:\n  title: Setup\n  Discover contains:\n    Read docs: 4 by User"],
  ["quadrant", "quadrant:\n  title: Priorities\n  x-axis: Effort to Value\n  y-axis: Risk to Impact\n  Quick win: 0.2, 0.9"],
];

test("all documented diagram kinds produce syntax accepted by bundled Mermaid", async () => {
  for (const [name, source] of examples) {
    const result = compile(source);
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
    await assert.doesNotReject(mermaid.parse(result.mermaid), `${name}: ${result.mermaid}`);
  }
});

test("hostile label content remains text and cannot append another Mermaid directive", async () => {
  const result = compile('sequence:\n  "Client" -> API: <script>alert(1)</script>\n');
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.mermaid, /<script>/);
  assert.equal((await mermaid.parse(result.mermaid)).diagramType, "sequence");
});
