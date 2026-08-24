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
    // endsWith("youtube.com") alone would also match notyoutube.com.
    return hostname === "youtube.com" || hostname.endsWith(".youtube.com");
  } catch (error) {
    return false;
  }
}

async function clearActionPopup(tabId) {
  await chrome.action.setPopup({ tabId, popup: "" });
}

function openPopupForTab(tab) {
  if (!tab || !tab.id) return;
  const tabId = tab.id;
  lastActionTabId = tabId;
  chrome.action.setPopup({ tabId, popup: POPUP_URL }, () => {
    let opening;
    try {
      opening = chrome.action.openPopup();
    } catch (error) {
      // openPopup() needs Chrome 127+; leave the popup set so the next click
      // opens it the built-in way.
      console.warn("Failed to open popup", error);
      return;
    }
    Promise.resolve(opening)
      .then(() =>
        // The popup is already showing, so unset it now: a configured popup
        // suppresses onClicked, which would otherwise strand this tab.
        clearActionPopup(tabId)
      )
      .catch((error) => {
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

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== CLEAR_POPUP_MESSAGE) return false;
  // Prefer the tab the popup reports: lastActionTabId is lost whenever the
  // service worker restarts.
  const tabId =
    typeof message.tabId === "number" ? message.tabId : lastActionTabId;
  if (typeof tabId !== "number") return false;
  clearActionPopup(tabId).catch((error) => {
    console.warn("Failed to clear popup", error);
  });
  return false;
});
