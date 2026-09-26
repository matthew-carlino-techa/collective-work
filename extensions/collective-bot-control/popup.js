const status = document.getElementById("status");

document.getElementById("pick").addEventListener("click", async () => {
  status.textContent = "Starting pick…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      status.textContent = "No active tab";
      return;
    }
    await chrome.tabs.sendMessage(tab.id, {
      type: "startPick",
      label: "element",
    });
    status.textContent = "Click an element on the page (Esc cancels)";
    window.close();
  } catch (e) {
    status.textContent =
      e instanceof Error ? e.message : "Open a Collective page first";
  }
});
