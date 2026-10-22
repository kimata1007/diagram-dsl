export function sitePermission(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:") return undefined;
  if (parsed.hostname === "github.com") return "https://github.com/*";
  if (parsed.hostname === "www.notion.so") return "https://www.notion.so/*";
  if (parsed.hostname === "notion.so") return "https://notion.so/*";
  if (parsed.hostname.endsWith(".notion.site")) return `https://${parsed.hostname}/*`;
  if (parsed.hostname === "notion.site") return "https://notion.site/*";
  return undefined;
}

export function sourceForBlock(element, site) {
  const text = (element?.innerText ?? element?.textContent ?? "").replace(/\r\n?/g, "\n");
  if (site === "github") {
    const lang = (element?.getAttribute?.("lang") ?? "").toLowerCase();
    const classes = `${element?.className ?? ""} ${element?.parentElement?.className ?? ""}`.toLowerCase();
    if (lang === "diagram-dsl" || /(?:^|\s)language-diagram-dsl(?:\s|$)/.test(classes)) return text;
    return undefined;
  }
  if (site === "notion") {
    const lines = text.split("\n");
    if (lines[0]?.trim().toLowerCase() !== "# diagram-dsl") return undefined;
    lines.shift();
    return lines.join("\n").replace(/^\n/, "");
  }
  return undefined;
}

export function candidateBlocks(document, site) {
  if (site === "github") {
    return [...document.querySelectorAll('pre[lang="diagram-dsl" i], pre > code.language-diagram-dsl')];
  }
  if (site === "notion") {
    const blocks = [...document.querySelectorAll("pre, code, [data-content-editable-leaf='true']")]
      .filter((element) => sourceForBlock(element, "notion") !== undefined);
    const seen = new Set();
    return blocks.filter((element) => {
      const block = element.closest("[data-block-id]") ?? element;
      if (seen.has(block)) return false;
      seen.add(block);
      return true;
    });
  }
  return [];
}
