import mermaid from "mermaid";
import { compile } from "../../src/index.ts";
import { candidateBlocks, sourceForBlock } from "./detect.js";

const hostname = location.hostname;
const site = hostname === "github.com" ? "github" : "notion";
let observer;
let scanTimer;
let paused = false;
const mounts = new WeakMap();
const mountedBlocks = new Set();

mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });

function addPreview(block) {
  const source = sourceForBlock(block, site);
  if (source === undefined) return;
  const existing = mounts.get(block);
  if (existing) {
    if (existing.__diagramDslSource !== source) {
      existing.__diagramDslSource = source;
      existing.__diagramDslRendered = false;
      existing.__diagramDslRevision += 1;
      existing.__diagramDslPanel.replaceChildren();
      existing.__diagramDslPanel.classList.remove("open");
      existing.__diagramDslButton.textContent = "図を表示";
      existing.__diagramDslButton.setAttribute("aria-expanded", "false");
    }
    return;
  }

  const host = document.createElement("div");
  host.dataset.diagramDslUi = "true";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; display: block; margin: 8px 0 16px; color: #24292f; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .bar { display:flex; align-items:center; gap:8px; }
      button { cursor:pointer; border:1px solid #d0d7de; border-radius:6px; background:#f6f8fa; color:#24292f; padding:5px 10px; font:inherit; }
      button:hover { background:#eaeef2; }
      .hint { color:#656d76; font-size:12px; }
      .panel { display:none; margin-top:9px; border:1px solid #d0d7de; border-radius:8px; background:#fff; padding:12px; overflow:auto; }
      .panel.open { display:block; }
      .errors { color:#b42318; white-space:pre-wrap; }
      .diagram { min-width:240px; overflow:auto; }
      .source { margin-top:10px; }
      summary { cursor:pointer; color:#57606a; }
      pre { white-space:pre-wrap; overflow-wrap:anywhere; background:#f6f8fa; padding:10px; border-radius:5px; }
      svg { max-width:100%; height:auto; }
    </style>
    <div class="bar"><button type="button" aria-expanded="false">図を表示</button><span class="hint">diagram-dsl · このブラウザ内で変換</span></div>
    <section class="panel" aria-live="polite"></section>`;
  const button = shadow.querySelector("button");
  const panel = shadow.querySelector(".panel");
  host.__diagramDslSource = source;
  host.__diagramDslRendered = false;
  host.__diagramDslRevision = 0;
  host.__diagramDslPanel = panel;
  host.__diagramDslButton = button;
  mounts.set(block, host);
  mountedBlocks.add(block);
  button.addEventListener("click", async () => {
    const isOpen = panel.classList.toggle("open");
    button.textContent = isOpen ? "図を隠す" : "図を表示";
    button.setAttribute("aria-expanded", String(isOpen));
    if (!isOpen || host.__diagramDslRendered) return;
    const revision = host.__diagramDslRevision;
    const result = compile(host.__diagramDslSource);
    if (!result.ok) {
      const errors = document.createElement("div");
      errors.className = "errors";
      errors.textContent = result.diagnostics.map((item) => `行 ${item.line}: ${item.message}`).join("\n");
      panel.replaceChildren(errors);
      host.__diagramDslRendered = true;
      return;
    }
    try {
      const diagram = document.createElement("div");
      diagram.className = "diagram";
      panel.replaceChildren(diagram);
      const renderedDiagram = await mermaid.render(`diagram-dsl-${crypto.randomUUID()}`, result.mermaid);
      if (revision !== host.__diagramDslRevision || paused) return;
      diagram.innerHTML = renderedDiagram.svg;
      renderedDiagram.bindFunctions?.(diagram);
      const details = document.createElement("details");
      details.className = "source";
      const summary = document.createElement("summary");
      summary.textContent = "生成したMermaidを見る";
      const pre = document.createElement("pre");
      pre.textContent = result.mermaid;
      details.append(summary, pre);
      panel.append(details);
    } catch (error) {
      if (revision !== host.__diagramDslRevision || paused) return;
      const errors = document.createElement("div");
      errors.className = "errors";
      errors.textContent = `図を描画できませんでした: ${error instanceof Error ? error.message : "unknown error"}`;
      panel.replaceChildren(errors);
    }
    host.__diagramDslRendered = true;
  });

  const insertionPoint = site === "notion" ? block.closest("[data-block-id]") ?? block : block.matches("code") ? block.closest("pre") ?? block : block;
  insertionPoint.insertAdjacentElement("afterend", host);
}

function scan() {
  if (paused || !document.body) return;
  for (const block of candidateBlocks(document, site)) addPreview(block);
}

function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, 180);
}

scan();
observer = new MutationObserver(scheduleScan);
observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "diagram-dsl-disable") {
    paused = true;
    observer.disconnect();
    clearTimeout(scanTimer);
    document.querySelectorAll("[data-diagram-dsl-ui]").forEach((element) => element.remove());
    for (const block of mountedBlocks) mounts.delete(block);
    mountedBlocks.clear();
    sendResponse({ ok: true });
  } else if (message?.type === "diagram-dsl-enable") {
    paused = false;
    scan();
    observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    sendResponse({ ok: true });
  }
});
