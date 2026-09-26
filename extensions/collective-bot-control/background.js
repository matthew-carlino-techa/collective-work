chrome.runtime.onInstalled.addListener(() => {
  console.log("[Collective Bot Control] installed");
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ping") {
    sendResponse({ ok: true, name: "Collective Bot Control" });
    return true;
  }
  return false;
});
