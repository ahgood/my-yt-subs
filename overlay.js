const FEED_URL = "https://www.youtube.com/feed/channels";
const LOGIN_URL =
  "https://accounts.google.com/ServiceLogin?service=youtube";
const OVERLAY_ID = "my-yt-subs-overlay";

const SELECTORS = {
  search: "[data-search]",
  searchWrap: "[data-search-wrap]",
  list: "[data-list]",
  state: "[data-state]",
  stateText: "[data-state-text]",
  empty: "[data-empty]",
  emptyActions: ".my-yt-subs-empty-actions",
  login: "[data-login]",
  close: "[data-overlay-close]",
};

let overlayRoot = null;
let overlayVisible = false;
let allChannels = [];
let elements = {
  searchWrap: null,
  searchInput: null,
  listEl: null,
  stateEl: null,
  stateText: null,
  emptyEl: null,
  emptyActions: null,
  loginButton: null,
  closeButtons: [],
};

function getAssetUrl(file) {
  return chrome.runtime.getURL(file);
}

async function ensureOverlay() {
  overlayRoot = document.getElementById(OVERLAY_ID);
  if (overlayRoot) return;

  const response = await fetch(getAssetUrl("overlay.html"));
  const markup = await response.text();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = markup.trim();
  overlayRoot = wrapper.firstElementChild;
  overlayRoot.id = OVERLAY_ID;
  overlayRoot.classList.add("my-yt-subs-hidden");

  document.body.appendChild(overlayRoot);
  bindOverlayElements();
}

function bindOverlayElements() {
  elements = {
    searchWrap: overlayRoot.querySelector(SELECTORS.searchWrap),
    searchInput: overlayRoot.querySelector(SELECTORS.search),
    listEl: overlayRoot.querySelector(SELECTORS.list),
    stateEl: overlayRoot.querySelector(SELECTORS.state),
    stateText: overlayRoot.querySelector(SELECTORS.stateText),
    emptyEl: overlayRoot.querySelector(SELECTORS.empty),
    emptyActions: overlayRoot.querySelector(SELECTORS.emptyActions),
    loginButton: overlayRoot.querySelector(SELECTORS.login),
    closeButtons: Array.from(overlayRoot.querySelectorAll(SELECTORS.close)),
  };

  elements.closeButtons.forEach((button) => {
    button.addEventListener("click", hideOverlay);
  });

  elements.searchInput?.addEventListener("input", (event) => {
    filterChannels(event.target.value);
  });

  elements.loginButton?.addEventListener("click", () => {
    openInCurrentTab(LOGIN_URL);
  });

  overlayRoot.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideOverlay();
    }
  });
}

function showOverlay() {
  overlayRoot.classList.remove("my-yt-subs-hidden");
  overlayVisible = true;
  document.body.style.overflow = "hidden";
  setSearchVisible(true);
  setEmptyActionsVisibility({
    showActions: true,
    showLogin: true,
  });
  elements.searchInput?.focus();
  loadSubscriptions();
}

function hideOverlay() {
  overlayRoot.classList.add("my-yt-subs-hidden");
  overlayVisible = false;
  document.body.style.overflow = "";
}

function toggleOverlay() {
  if (!overlayRoot) return;
  if (overlayVisible) {
    hideOverlay();
  } else {
    showOverlay();
  }
}

function setState(message) {
  if (!elements.stateText || !elements.stateEl || !elements.listEl || !elements.emptyEl) {
    return;
  }
  setSearchVisible(true);
  elements.stateText.textContent = message;
  elements.stateEl.hidden = false;
  elements.listEl.hidden = true;
  elements.emptyEl.hidden = true;
}

function showEmpty() {
  setSearchVisible(false);
  showEmptyState("Please sign in to YouTube to load subscriptions.", {
    bodyText: "Open YouTube and sign in, then open the overlay again.",
    showActions: true,
    actions: {
      showLogin: true,
    },
  });
}

function showList() {
  setSearchVisible(true);
  elements.stateEl.hidden = true;
  elements.listEl.hidden = false;
  elements.emptyEl.hidden = true;
}

function showEmptyState(message, options = {}) {
  setSearchVisible(false);
  elements.stateEl.hidden = true;
  elements.listEl.hidden = true;
  elements.emptyEl.hidden = false;
  const title = elements.emptyEl.querySelector(".my-yt-subs-empty-title");
  const body = elements.emptyEl.querySelector(".my-yt-subs-empty-body");
  if (title && message) {
    title.textContent = message;
  }
  if (body && options.bodyText) {
    body.textContent = options.bodyText;
  }
  if (elements.emptyActions) {
    elements.emptyActions.hidden = !options.showActions;
    if (options.showActions && options.actions) {
      setEmptyActionsVisibility(options.actions);
    }
  }
}

function setSearchVisible(visible) {
  if (!elements.searchWrap) return;
  elements.searchWrap.hidden = !visible;
}

function setEmptyActionsVisibility({
  showActions = true,
  showLogin = true,
} = {}) {
  if (!elements.emptyActions) return;
  elements.emptyActions.hidden = !showActions;
  if (elements.loginButton) {
    elements.loginButton.hidden = !showLogin;
  }
}

function normalizeUrl(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `https://www.youtube.com${url}`;
}


function openExternal(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener");
}

function openInCurrentTab(url) {
  if (!url) return;
  window.location.href = url;
}

function renderList(channels) {
  elements.listEl.innerHTML = "";
  if (!channels.length) {
    showEmpty();
    return;
  }

  const fragment = document.createDocumentFragment();
  channels.forEach((channel) => {
    const card = document.createElement("div");
    card.className = "my-yt-subs-card";
    card.tabIndex = 0;

    const avatar = document.createElement("img");
    avatar.className = "my-yt-subs-avatar";
    avatar.alt = `${channel.name} avatar`;
    avatar.src = channel.avatar || "";

    const name = document.createElement("div");
    name.className = "my-yt-subs-name";
    name.textContent = channel.name;

    card.appendChild(avatar);
    card.appendChild(name);

    card.addEventListener("click", () => openExternal(normalizeUrl(channel.url)));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        openExternal(normalizeUrl(channel.url));
      }
    });

    fragment.appendChild(card);
  });

  elements.listEl.appendChild(fragment);
  showList();
}

function filterChannels(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    renderList(allChannels);
    return;
  }

  const filtered = allChannels.filter((channel) =>
    channel.name.toLowerCase().includes(normalized)
  );
  if (!filtered.length) {
    elements.listEl.innerHTML = "";
    showEmptyState("No channels match your search.", {
      bodyText: "Try a different search.",
      showActions: false,
    });
    return;
  }
  renderList(filtered);
}

function parseInitialData(html) {
  const match = html.match(/ytInitialData\s*=\s*(\{.*?\});/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}

function extractChannelsFromInitialData(initialData) {
  if (!initialData) return [];
  const results = [];

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (node.channelRenderer) {
      const renderer = node.channelRenderer;
      const name = renderer.title?.simpleText || "";
      const url = renderer.navigationEndpoint?.commandMetadata?.webCommandMetadata
        ?.url;
      const avatar = renderer.thumbnail?.thumbnails?.slice(-1)[0]?.url || "";
      if (name && url) {
        results.push({ name, url, avatar });
      }
    }

    Object.values(node).forEach(walk);
  }

  walk(initialData);

  return dedupeChannels(results);
}

function extractChannelsFromDom(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const anchors = Array.from(
    doc.querySelectorAll('a[href*="/channel/"], a[href^="/@"]')
  );

  const results = anchors
    .map((anchor) => {
      const name = anchor.textContent?.trim();
      const url = anchor.getAttribute("href");
      const img = anchor.querySelector("img");
      const avatar = img?.getAttribute("src") || "";
      return { name, url, avatar };
    })
    .filter((item) => item.name && item.url);

  return dedupeChannels(results);
}

function dedupeChannels(channels) {
  const seen = new Set();
  return channels.filter((channel) => {
    const key = `${channel.name}|${channel.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasSignedOutMarkers(html) {
  return (
    html.includes("Sign in") &&
    html.includes("ServiceLogin") &&
    html.includes("accounts.google.com")
  );
}

async function loadSubscriptions() {
  setState("Loading subscriptions...");
  try {
    const response = await fetch(FEED_URL, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Network error: ${response.status}`);
    }

    const html = await response.text();
    const initialData = parseInitialData(html);
    const fromInitial = extractChannelsFromInitialData(initialData);
    const channels = fromInitial.length
      ? fromInitial
      : extractChannelsFromDom(html);

    if (!channels.length) {
      if (hasSignedOutMarkers(html)) {
        showEmpty();
      } else {
    showEmptyState("Unable to find subscriptions.", {
      bodyText:
        "YouTube may have updated the page. Reopen the overlay or open the subscriptions feed.",
      showActions: true,
      actions: {
        showLogin: true,
      },
    });
      }
      return;
    }

    allChannels = channels;
    renderList(allChannels);
  } catch (error) {
    console.error("Failed to load subscriptions", error);
    showEmpty();
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "MY_YT_SUBS_TOGGLE") return;

  ensureOverlay()
    .then(toggleOverlay)
    .catch((error) => {
      console.error("Failed to initialize overlay", error);
    });
});
