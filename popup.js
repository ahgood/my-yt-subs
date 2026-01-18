const FEED_URL = "https://www.youtube.com/feed/channels";
const LOGIN_URL =
  "https://accounts.google.com/ServiceLogin?service=youtube";
const CACHE_KEY = "subscriptionsCache";
const CACHE_TTL_MS = 30 * 60 * 1000;

const stateEl = document.getElementById("state");
const stateText = document.getElementById("stateText");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const searchInput = document.getElementById("searchInput");
const refreshButton = document.getElementById("refreshButton");
const loginButton = document.getElementById("loginButton");
const openFeedButton = document.getElementById("openFeedButton");
const emptyActions = document.querySelector(".empty-actions");

let allChannels = [];

function setState(message) {
  stateText.textContent = message;
  stateEl.hidden = false;
  listEl.hidden = true;
  emptyEl.hidden = true;
}

function showEmpty() {
  showEmptyState("Please sign in to YouTube to load subscriptions.", {
    bodyText: "Open YouTube and sign in, then click Refresh.",
    showActions: true,
  });
}

function showList() {
  stateEl.hidden = true;
  listEl.hidden = false;
  emptyEl.hidden = true;
}

function showEmptyState(message, options = {}) {
  stateEl.hidden = true;
  listEl.hidden = true;
  emptyEl.hidden = false;
  const title = emptyEl.querySelector(".empty-title");
  const body = emptyEl.querySelector(".empty-body");
  if (title && message) {
    title.textContent = message;
  }
  if (body && options.bodyText) {
    body.textContent = options.bodyText;
  }
  if (emptyActions) {
    emptyActions.hidden = !options.showActions;
  }
}

function normalizeUrl(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `https://www.youtube.com${url}`;
}

function renderList(channels) {
  listEl.innerHTML = "";
  if (!channels.length) {
    showEmpty();
    return;
  }

  const fragment = document.createDocumentFragment();
  channels.forEach((channel) => {
    const row = document.createElement("div");
    row.className = "row";
    row.tabIndex = 0;

    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.alt = `${channel.name} avatar`;
    avatar.src = channel.avatar || "";

    const name = document.createElement("div");
    name.className = "channel-name";
    name.textContent = channel.name;

    row.appendChild(avatar);
    row.appendChild(name);

    row.addEventListener("click", () => openChannel(channel.url));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        openChannel(channel.url);
      }
    });

    fragment.appendChild(row);
  });

  listEl.appendChild(fragment);
  showList();
}

function openChannel(url) {
  const target = normalizeUrl(url);
  if (!target) return;
  chrome.tabs.create({ url: target });
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
    listEl.innerHTML = "";
    showEmptyState("No channels match your search.", {
      bodyText: "Try a different search.",
      showActions: false,
    });
    return;
  }
  renderList(filtered);
}

async function getCachedSubscriptions() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  if (!result[CACHE_KEY]) return null;
  const { timestamp, data } = result[CACHE_KEY];
  if (!timestamp || Date.now() - timestamp > CACHE_TTL_MS) return null;
  return data;
}

async function setCachedSubscriptions(data) {
  await chrome.storage.local.set({
    [CACHE_KEY]: {
      timestamp: Date.now(),
      data,
    },
  });
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

async function loadSubscriptions(forceRefresh = false) {
  setState("Loading subscriptions...");
  try {
    if (!forceRefresh) {
      const cached = await getCachedSubscriptions();
      if (cached && cached.length) {
        allChannels = cached;
        renderList(allChannels);
        return;
      }
    }

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
            "YouTube may have updated the page. Try Refresh or open the subscriptions feed.",
          showActions: true,
        });
      }
      return;
    }

    allChannels = channels;
    await setCachedSubscriptions(channels);
    renderList(allChannels);
  } catch (error) {
    console.error("Failed to load subscriptions", error);
    showEmpty();
  }
}

searchInput.addEventListener("input", (event) => {
  filterChannels(event.target.value);
});

refreshButton.addEventListener("click", () => {
  loadSubscriptions(true);
});

loginButton.addEventListener("click", () => {
  chrome.tabs.create({ url: LOGIN_URL });
});

openFeedButton.addEventListener("click", () => {
  chrome.tabs.create({ url: FEED_URL });
});

loadSubscriptions();
