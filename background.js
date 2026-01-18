const TOGGLE_SCRIPT = "overlay.js";

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  const tabId = tab.id;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "MY_YT_SUBS_TOGGLE" });
  } catch (error) {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["overlay.css"],
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [TOGGLE_SCRIPT],
      });
      await chrome.tabs.sendMessage(tabId, { type: "MY_YT_SUBS_TOGGLE" });
    } catch (injectError) {
      console.error("Failed to toggle overlay", injectError);
    }
  }
});
