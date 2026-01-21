const YOUTUBE_URL = "https://www.youtube.com/";
const CLEAR_POPUP_MESSAGE = "MY_YT_SUBS_CLEAR_POPUP";

const openYouTubeButton = document.getElementById("openYouTubeButton");

openYouTubeButton?.addEventListener("click", () => {
  chrome.tabs.create({ url: YOUTUBE_URL });
});

chrome.runtime.sendMessage({ type: CLEAR_POPUP_MESSAGE }).catch(() => {});
