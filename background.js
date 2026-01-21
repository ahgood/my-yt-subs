const TOGGLE_SCRIPT = "overlay.js";
const POPUP_URL = chrome.runtime.getURL("popup.html");
const CLEAR_POPUP_MESSAGE = "MY_YT_SUBS_CLEAR_POPUP";

let lastActionTabId = null;

function isHttpUrl(url) {
  return url.startsWith("http://") || url.startsWith("https://");
}

function isYouTubeUrl(url) {
  if (!isHttpUrl(url)) return false;
  try {
    const { hostname } = new URL(url);
    return hostname.endsWith("youtube.com");
  } catch (error) {
    return false;
  }
}

async function clearActionPopup(tabId) {
  await chrome.action.setPopup({ tabId, popup: "" });
}

function openPopupForTab(tab) {
  if (!tab || !tab.id) return;
  lastActionTabId = tab.id;
  chrome.action.setPopup({ tabId: tab.id, popup: POPUP_URL }, () => {
    chrome.action.openPopup().catch((error) => {
      console.warn("Failed to open popup", error);
    });
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  if (!isYouTubeUrl(tab.url || "")) {
    openPopupForTab(tab);
    return;
  }

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
      openPopupForTab(tab);
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === CLEAR_POPUP_MESSAGE && lastActionTabId) {
    clearActionPopup(lastActionTabId).catch((error) => {
      console.warn("Failed to clear popup", error);
    });
    return true;
  }
  return false;
});
