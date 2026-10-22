function permissionFor(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    if (parsed.hostname === "github.com") return "https://github.com/*";
    if (parsed.hostname === "www.notion.so") return "https://www.notion.so/*";
    if (parsed.hostname === "notion.so") return "https://notion.so/*";
    if (parsed.hostname === "notion.site") return "https://notion.site/*";
    if (parsed.hostname.endsWith(".notion.site")) return `https://${parsed.hostname}/*`;
  } catch {}
  return undefined;
}

async function injectIfEnabled(tabId, url) {
  const originPattern = permissionFor(url);
  if (!originPattern) return;
  const key = `enabled:${originPattern}`;
  const saved = await chrome.storage.local.get(key);
  if (!saved[key]) return;
  const granted = await chrome.permissions.contains({ origins: [originPattern] });
  if (!granted) return;
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "diagram-dsl-enable" });
    if (response?.ok) return;
  } catch {
    // The tab does not have the content script yet; inject it below.
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch {
    // Restricted pages and tabs that close during navigation are intentionally ignored.
  }
}

async function disableInTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "diagram-dsl-disable" });
  } catch {
    // No content script is present in this tab.
  }
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === "complete" && tab.url) void injectIfEnabled(tabId, tab.url);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "diagram-dsl-enabled" && Number.isInteger(message.tabId) && typeof message.url === "string") {
    void injectIfEnabled(message.tabId, message.url).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "diagram-dsl-disabled" && Number.isInteger(message.tabId)) {
    void disableInTab(message.tabId).then(() => sendResponse({ ok: true }));
    return true;
  }
});
