import { sitePermission } from "./src/detect.js";

const button = document.querySelector("#toggle");
const siteLabel = document.querySelector("#site");
const status = document.querySelector("#status");
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const pattern = sitePermission(tab?.url ?? "");
const key = pattern ? `enabled:${pattern}` : undefined;

if (!pattern || !key) {
  button.textContent = "このサイトでは使えません";
  siteLabel.textContent = "対応サイト: GitHub Issue/PR、Notion";
} else {
  const host = new URL(tab.url).hostname;
  siteLabel.textContent = `${host} 全体のDSLコードブロックをプレビューします。`;
  const saved = await chrome.storage.local.get(key);
  const granted = await chrome.permissions.contains({ origins: [pattern] });
  button.disabled = false;
  button.textContent = saved[key] && granted ? "このサイトで無効にする" : "このサイトで有効にする";
  button.addEventListener("click", async () => {
    button.disabled = true;
    if (saved[key] && granted) {
      await chrome.runtime.sendMessage({ type: "diagram-dsl-disabled", tabId: tab.id });
      await chrome.storage.local.remove(key);
      await chrome.permissions.remove({ origins: [pattern] });
      status.textContent = "このサイトでは無効になりました。";
      button.textContent = "このサイトで有効にする";
      button.disabled = false;
      return;
    }
    const allowed = granted || await chrome.permissions.request({ origins: [pattern] });
    if (!allowed) {
      status.textContent = "サイトアクセスが許可されませんでした。";
      button.disabled = false;
      return;
    }
    await chrome.storage.local.set({ [key]: true });
    await chrome.runtime.sendMessage({ type: "diagram-dsl-enabled", tabId: tab.id, url: tab.url });
    status.textContent = "有効になりました。DSLコードブロックに「図を表示」が現れます。";
    button.textContent = "このサイトで無効にする";
    button.disabled = false;
  });
}
