import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { candidateBlocks, sourceForBlock, sitePermission } from "../extension/src/detect.js";

function element({ text, lang = "", className = "", parentClass = "" }) {
  return {
    innerText: text,
    className,
    parentElement: { className: parentClass },
    getAttribute(name) { return name === "lang" ? lang : null; },
  };
}

test("extension asks only for supported site host patterns", async () => {
  assert.equal(sitePermission("https://github.com/kimata1007/diagram-dsl/issues/1"), "https://github.com/*");
  assert.equal(sitePermission("https://www.notion.so/workspace/page"), "https://www.notion.so/*");
  assert.equal(sitePermission("https://team.notion.site/page"), "https://team.notion.site/*");
  assert.equal(sitePermission("https://notion.site/page"), "https://notion.site/*");
  assert.equal(sitePermission("https://example.com"), undefined);
  assert.equal(sitePermission("http://github.com"), undefined);
  const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  const firefoxManifest = JSON.parse(await readFile(new URL("../extension/manifest.firefox.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ["https://github.com/*", "https://www.notion.so/*", "https://notion.so/*", "https://*.notion.site/*", "https://notion.site/*"]);
  assert.equal(firefoxManifest.manifest_version, 3);
  assert.deepEqual(firefoxManifest.background.scripts, ["service-worker.js"]);
  assert.equal(firefoxManifest.background.service_worker, undefined);
});

test("GitHub detection requires the explicit fence language", () => {
  const source = "ArgoCD -> GitHub: deploy";
  assert.equal(sourceForBlock(element({ text: source, lang: "diagram-dsl" }), "github"), source);
  assert.equal(sourceForBlock(element({ text: source, className: "language-diagram-dsl" }), "github"), source);
  assert.equal(sourceForBlock(element({ text: source, lang: "text" }), "github"), undefined);
});

test("Notion detection requires and strips the explicit marker", () => {
  assert.equal(sourceForBlock(element({ text: "# diagram-dsl\nArgoCD -> GitHub: deploy" }), "notion"), "ArgoCD -> GitHub: deploy");
  assert.equal(sourceForBlock(element({ text: "regular text\nArgoCD -> GitHub" }), "notion"), undefined);
});

test("Notion candidates are deduplicated by their containing block", async () => {
  const dom = new JSDOM('<div data-block-id="1"><pre><code data-content-editable-leaf="true"># diagram-dsl\nA -&gt; B: go</code></pre></div>');
  assert.equal(candidateBlocks(dom.window.document, "notion").length, 1);
  dom.window.close();
});

test("the bundled GitHub content script adds an on-demand panel without changing source", async () => {
  const source = "not a diagram";
  const dom = new JSDOM(`<main><pre lang="diagram-dsl">${source}</pre></main>`, {
    url: "https://github.com/example/project/issues/1",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  let listener;
  dom.window.chrome = { runtime: { onMessage: { addListener(callback) { listener = callback; } } } };
  const bundle = await readFile(new URL("../extension/dist/content.js", import.meta.url), "utf8");
  dom.window.eval(bundle);
  const block = dom.window.document.querySelector("pre");
  const host = block.nextElementSibling;
  assert.equal(host.dataset.diagramDslUi, "true");
  assert.equal(block.textContent, source);
  const button = host.shadowRoot.querySelector("button");
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(host.shadowRoot.querySelector(".errors").textContent, /Expected a connection/);
  let response;
  listener({ type: "diagram-dsl-disable" }, {}, (value) => { response = value; });
  assert.equal(response?.ok, true);
  assert.equal(dom.window.document.querySelector("[data-diagram-dsl-ui]"), null);
  listener({ type: "diagram-dsl-enable" }, {}, (value) => { response = value; });
  assert.equal(response?.ok, true);
  assert.ok(dom.window.document.querySelector("[data-diagram-dsl-ui]"));
  dom.window.close();
});

test("the bundled Notion content script augments one block and notices text edits", async () => {
  const dom = new JSDOM('<main><div data-block-id="abc"><pre><code data-content-editable-leaf="true"># diagram-dsl\nA -&gt; B: go</code></pre></div></main>', {
    url: "https://workspace.notion.site/page",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  dom.window.chrome = { runtime: { onMessage: { addListener() {} } } };
  const bundle = await readFile(new URL("../extension/dist/content.js", import.meta.url), "utf8");
  dom.window.eval(bundle);
  const block = dom.window.document.querySelector("[data-block-id]");
  assert.equal(dom.window.document.querySelectorAll("[data-diagram-dsl-ui]").length, 1);
  const host = dom.window.document.querySelector("[data-diagram-dsl-ui]");
  assert.equal(host.parentElement, block.parentElement);
  block.querySelector("code").firstChild.textContent = "# diagram-dsl\nA -> C: updated";
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.match(host.__diagramDslSource, /A -> C: updated/);
  assert.match(block.textContent, /updated/);
  dom.window.close();
});
