const FEED_URL = "https://www.youtube.com/feed/channels";
const LOGIN_URL =
  "https://accounts.google.com/ServiceLogin?service=youtube";
const OVERLAY_ID = "my-yt-subs-overlay";
const STARRED_KEY = "myYtSubs.starred.v1";
// Digits before letters, accents folded next to their base letter, case
// insensitive, and "Episode 2" before "Episode 10".
const CHANNEL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const CHANNELS_KEY = "myYtSubs.channels.v1";
const STAR_PATH =
  "M12.0 3.9 L14.29 9.74 L20.56 10.12 L15.71 14.11 L17.29 20.18 " +
  "L12.0 16.8 L6.71 20.18 L8.29 14.11 L3.44 10.12 L9.71 9.74Z";

const SELECTORS = {
  search: "[data-search]",
  searchWrap: "[data-search-wrap]",
  list: "[data-list]",
  starredList: "[data-starred-list]",
  starredSection: "[data-starred-section]",
  allSection: "[data-all-section]",
  starredCount: "[data-starred-count]",
  body: "[data-body]",
  allCount: "[data-all-count]",
  state: "[data-state]",
  stateText: "[data-state-text]",
  empty: "[data-empty]",
  emptyActions: ".my-yt-subs-empty-actions",
  login: "[data-login]",
  close: "[data-overlay-close]",
  refresh: "[data-refresh]",
  exportButton: "[data-export]",
  importButton: "[data-import]",
  importFile: "[data-import-file]",
  footerStatus: "[data-footer-status]",
};

let overlayRoot = null;
let overlayReady = null;
let overlayVisible = false;
let globalKeydownBound = false;
let allChannels = [];
let channelsFetchedAt = 0;
let starredChannels = new Map();
let isLoading = false;
let isFetching = false;
let searchComposing = false;
let previousBodyOverflow = "";
let elements = {
  searchWrap: null,
  searchInput: null,
  listEl: null,
  bodyEl: null,
  starredListEl: null,
  starredSection: null,
  allSection: null,
  starredCount: null,
  allCount: null,
  stateEl: null,
  stateText: null,
  emptyEl: null,
  emptyActions: null,
  loginButton: null,
  refreshButton: null,
  exportButton: null,
  importButton: null,
  importFile: null,
  footerStatus: null,
  closeButtons: [],
};

function getAssetUrl(file) {
  return chrome.runtime.getURL(file);
}

function ensureOverlay() {
  // The overlay is still in the page: nothing to build.
  if (overlayRoot?.isConnected) return Promise.resolve();

  // Share the in-flight build so two fast toggles cannot create two overlays,
  // then drop it so a removed overlay can be rebuilt.
  if (!overlayReady) {
    overlayReady = createOverlay().finally(() => {
      overlayReady = null;
    });
  }
  return overlayReady;
}

async function createOverlay() {
  const response = await fetch(getAssetUrl("overlay.html"));
  const markup = await response.text();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = markup.trim();

  // Drop any leftover overlay from an earlier injection so ids stay unique.
  document.getElementById(OVERLAY_ID)?.remove();

  overlayRoot = wrapper.firstElementChild;
  overlayRoot.id = OVERLAY_ID;
  overlayRoot.classList.add("my-yt-subs-hidden");
  // A rebuilt overlay starts hidden, so forget any visibility the old one had:
  // otherwise the next toggle closes an overlay that is not on screen.
  overlayVisible = false;

  document.body.appendChild(overlayRoot);
  bindOverlayElements();
}

function bindOverlayElements() {
  elements = {
    searchWrap: overlayRoot.querySelector(SELECTORS.searchWrap),
    searchInput: overlayRoot.querySelector(SELECTORS.search),
    listEl: overlayRoot.querySelector(SELECTORS.list),
    bodyEl: overlayRoot.querySelector(SELECTORS.body),
    starredListEl: overlayRoot.querySelector(SELECTORS.starredList),
    starredSection: overlayRoot.querySelector(SELECTORS.starredSection),
    allSection: overlayRoot.querySelector(SELECTORS.allSection),
    starredCount: overlayRoot.querySelector(SELECTORS.starredCount),
    allCount: overlayRoot.querySelector(SELECTORS.allCount),
    stateEl: overlayRoot.querySelector(SELECTORS.state),
    stateText: overlayRoot.querySelector(SELECTORS.stateText),
    emptyEl: overlayRoot.querySelector(SELECTORS.empty),
    emptyActions: overlayRoot.querySelector(SELECTORS.emptyActions),
    loginButton: overlayRoot.querySelector(SELECTORS.login),
    refreshButton: overlayRoot.querySelector(SELECTORS.refresh),
    exportButton: overlayRoot.querySelector(SELECTORS.exportButton),
    importButton: overlayRoot.querySelector(SELECTORS.importButton),
    importFile: overlayRoot.querySelector(SELECTORS.importFile),
    footerStatus: overlayRoot.querySelector(SELECTORS.footerStatus),
    closeButtons: Array.from(overlayRoot.querySelectorAll(SELECTORS.close)),
  };

  elements.closeButtons.forEach((button) => {
    button.addEventListener("click", hideOverlay);
  });

  elements.searchInput?.addEventListener("compositionstart", () => {
    searchComposing = true;
  });

  elements.searchInput?.addEventListener("compositionend", (event) => {
    searchComposing = false;
    filterChannels(event.target.value);
  });

  elements.searchInput?.addEventListener("blur", () => {
    searchComposing = false;
  });

  elements.searchInput?.addEventListener("input", (event) => {
    // Skip in-progress IME text (pinyin, kana, ...); wait for compositionend.
    if (searchComposing || event.isComposing) return;
    filterChannels(event.target.value);
  });

  elements.loginButton?.addEventListener("click", () => {
    openInCurrentTab(LOGIN_URL);
  });

  elements.refreshButton?.addEventListener("click", () => {
    // With a list on screen, refresh in place instead of blanking it.
    loadSubscriptions({ silent: allChannels.length > 0 });
  });

  elements.exportButton?.addEventListener("click", exportStarred);

  elements.importButton?.addEventListener("click", () => {
    elements.importFile?.click();
  });

  elements.importFile?.addEventListener("change", (event) => {
    const input = event.target;
    const [file] = input.files ?? [];
    importStarred(file).finally(() => {
      // Let the same file be picked again.
      input.value = "";
    });
  });

  loadStarred();

  // Keep the host page's keyboard shortcuts from reacting to typing in the overlay.
  ["keydown", "keypress", "keyup"].forEach((type) => {
    overlayRoot.addEventListener(type, (event) => {
      event.stopPropagation();
    });
  });

  // YouTube listens for wheel and touch events on the document; scrolling our
  // list should not run its handlers. Passive, so this can never block a scroll.
  ["wheel", "touchmove"].forEach((type) => {
    overlayRoot.addEventListener(
      type,
      (event) => {
        event.stopPropagation();
      },
      { passive: true }
    );
  });

  if (!globalKeydownBound) {
    document.addEventListener("keydown", handleGlobalKeydown, true);
    globalKeydownBound = true;
  }
}

function handleGlobalKeydown(event) {
  if (!overlayVisible) return;
  // Let the IME consume its own keys (Escape/Enter cancel or commit a composition).
  if (searchComposing || event.isComposing || event.keyCode === 229) return;
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  hideOverlay();
}

function showOverlay() {
  overlayRoot.classList.remove("my-yt-subs-hidden");
  overlayVisible = true;
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  if (elements.searchInput) {
    // Start from a clean query so the box always matches the rendered list.
    elements.searchInput.value = "";
  }
  setFooterStatus("");
  // Another YouTube tab may have starred something since we last looked.
  loadStarred();
  setSearchVisible(true);
  setEmptyActionsVisibility({
    showActions: true,
    showLogin: true,
  });
  elements.searchInput?.focus();
  showChannelList();
}

function showChannelList() {
  // Only hit the network when we have nothing to show; the Refresh button is
  // how a stale list gets updated.
  if (allChannels.length) {
    updateRefreshLabel();
    applyCurrentFilter();
    return;
  }

  const cached = loadCachedChannels();
  if (cached.length) {
    allChannels = cached;
    refreshStarredFromFeed();
    updateRefreshLabel();
    applyCurrentFilter();
    return;
  }

  loadSubscriptions();
}

function hideOverlay() {
  overlayRoot.classList.add("my-yt-subs-hidden");
  overlayVisible = false;
  searchComposing = false;
  document.body.style.overflow = previousBodyOverflow;
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
  hideSections();
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

function hideSections() {
  if (elements.starredSection) elements.starredSection.hidden = true;
  if (elements.allSection) elements.allSection.hidden = true;
}

function showSections(starredTotal, allTotal) {
  setSearchVisible(true);
  elements.stateEl.hidden = true;
  elements.emptyEl.hidden = true;
  // An empty section is hidden outright, heading and all.
  if (elements.starredSection) elements.starredSection.hidden = !starredTotal;
  if (elements.allSection) elements.allSection.hidden = !allTotal;
  if (elements.starredCount) {
    elements.starredCount.textContent = starredTotal ? `(${starredTotal})` : "";
  }
  if (elements.allCount) {
    elements.allCount.textContent = allTotal ? `(${allTotal})` : "";
  }
}

function showEmptyState(message, options = {}) {
  setSearchVisible(Boolean(options.showSearch));
  elements.stateEl.hidden = true;
  hideSections();
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
  // Hiding the input mid-composition kills the IME and drops focus to the page.
  if (!visible && searchComposing) return;
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


const AVATAR_PX = 88;

function shrinkAvatarUrl(url) {
  if (!url) return "";
  // YouTube puts the rendered size in the URL ("=s900-c-k-c0x..."). Cards show
  // a 40px avatar, so asking for a 900px one costs a needless decode.
  return url
    .replace(/=s\d+/, `=s${AVATAR_PX}`)
    .replace(/=w\d+-h\d+/, `=w${AVATAR_PX}-h${AVATAR_PX}`);
}

function pickThumbnail(thumbnails) {
  if (!Array.isArray(thumbnails)) return "";
  const usable = thumbnails.filter((thumb) => thumb?.url);
  if (!usable.length) return "";
  const bySize = usable
    .slice()
    .sort((a, b) => (a.width || 0) - (b.width || 0));
  // Smallest that still covers a 2x 40px avatar, else the largest on offer.
  const chosen = bySize.find((thumb) => (thumb.width || 0) >= 80) || bySize[bySize.length - 1];
  return shrinkAvatarUrl(chosen.url);
}

// starKey runs three times per rendered card, so memoise it: `new URL()` is
// not cheap when a list is 500 channels long.
const starKeyCache = new Map();

function starKey(url) {
  if (!url) return "";
  const cached = starKeyCache.get(url);
  if (cached !== undefined) return cached;

  let key = "";
  try {
    // Identity is the channel path: display names change, paths do not.
    key = new URL(normalizeUrl(url)).pathname.replace(/\/+$/, "").toLowerCase();
  } catch (error) {
    key = "";
  }
  starKeyCache.set(url, key);
  return key;
}

function isStarred(url) {
  const key = starKey(url);
  return Boolean(key) && starredChannels.has(key);
}

function toStarredEntries(payload) {
  const list = Array.isArray(payload) ? payload : payload?.channels;
  if (!Array.isArray(list)) return [];

  const entries = [];
  list.forEach((item) => {
    const url = typeof item?.url === "string" ? item.url : "";
    const key = starKey(url);
    if (!key) return;
    entries.push({
      key,
      url,
      name: typeof item.name === "string" && item.name ? item.name : url,
      avatar: typeof item.avatar === "string" ? item.avatar : "",
      starredAt: Number.isFinite(item.starredAt) ? item.starredAt : Date.now(),
    });
  });
  return entries;
}

function loadStarred() {
  starredChannels = new Map();

  let raw = null;
  try {
    // localStorage throws outright when site data is blocked.
    raw = localStorage.getItem(STARRED_KEY);
  } catch (error) {
    console.warn("Starred channels are unavailable", error);
    return;
  }
  if (!raw) return;

  try {
    toStarredEntries(JSON.parse(raw)).forEach((entry) => {
      starredChannels.set(entry.key, entry);
    });
  } catch (error) {
    console.warn("Ignoring unreadable starred channels", error);
  }
}

function saveStarred() {
  try {
    localStorage.setItem(STARRED_KEY, JSON.stringify(buildStarredPayload()));
    return true;
  } catch (error) {
    console.warn("Failed to save starred channels", error);
    setFooterStatus("Could not save starred channels.");
    return false;
  }
}

function buildStarredPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    channels: Array.from(starredChannels.values())
      .sort((a, b) => a.starredAt - b.starredAt)
      .map(({ url, name, avatar, starredAt }) => ({
        url,
        name,
        avatar,
        starredAt,
      })),
  };
}

function findCardByKey(key) {
  if (!key || !elements.bodyEl) return null;
  return (
    Array.from(elements.bodyEl.querySelectorAll(".my-yt-subs-card")).find(
      (card) => card.dataset.channelKey === key
    ) || null
  );
}

function captureScrollAnchor(movingKey) {
  const scroller = elements.bodyEl;
  if (!scroller) return null;

  const scrollerTop = scroller.getBoundingClientRect().top;
  const cards = Array.from(scroller.querySelectorAll(".my-yt-subs-card"));
  // The topmost card still on screen, ignoring the one that is about to move.
  for (const card of cards) {
    if (card.dataset.channelKey === movingKey) continue;
    const offset = card.getBoundingClientRect().top - scrollerTop;
    if (offset >= 0) {
      return { key: card.dataset.channelKey, offset, scrollTop: scroller.scrollTop };
    }
  }
  return { key: "", offset: 0, scrollTop: scroller.scrollTop };
}

function restoreScrollAnchor(anchor) {
  const scroller = elements.bodyEl;
  if (!scroller || !anchor) return;

  scroller.scrollTop = anchor.scrollTop;
  const card = findCardByKey(anchor.key);
  if (!card) return;

  // Moving a card between sections changes the height above it, so pin the
  // card the viewer was looking at back to the same place on screen.
  const offset = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTop += offset - anchor.offset;
}

function toggleStar(channel) {
  const key = starKey(channel.url);
  if (!key) return;

  setFooterStatus("");
  const anchor = captureScrollAnchor(key);

  if (starredChannels.has(key)) {
    starredChannels.delete(key);
  } else {
    starredChannels.set(key, {
      key,
      url: channel.url,
      name: channel.name,
      avatar: channel.avatar || "",
      starredAt: Date.now(),
    });
  }
  saveStarred();
  applyCurrentFilter();
  restoreScrollAnchor(anchor);

  // Re-rendering replaced the button that was just clicked, so hand focus to
  // its counterpart in whichever section the card landed in. preventScroll
  // matters: focus() would otherwise scroll the moved card into view.
  const buttons = overlayRoot?.querySelectorAll("[data-star-key]") ?? [];
  Array.from(buttons)
    .find((button) => button.dataset.starKey === key)
    ?.focus({ preventScroll: true });
}

function setFooterStatus(message) {
  if (!elements.footerStatus) return;
  elements.footerStatus.textContent = message || "";
}

function pluralChannels(count) {
  return `${count} channel${count === 1 ? "" : "s"}`;
}

function exportStarred() {
  if (!starredChannels.size) {
    setFooterStatus("Nothing to export yet.");
    return;
  }

  const payload = buildStarredPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `my-yt-subs-starred-${payload.exportedAt.slice(0, 10)}.json`;
  overlayRoot.appendChild(link);
  link.click();
  link.remove();
  // Chrome starts the download on click; revoke once that has settled.
  setTimeout(() => URL.revokeObjectURL(href), 0);
  setFooterStatus(`Exported ${pluralChannels(payload.channels.length)}.`);
}

async function importStarred(file) {
  if (!file) return;

  let payload = null;
  try {
    payload = JSON.parse(await file.text());
  } catch (error) {
    console.warn("Failed to read starred channels file", error);
    setFooterStatus("Could not read that file.");
    return;
  }

  const entries = toStarredEntries(payload);
  if (!entries.length) {
    setFooterStatus("No starred channels found in that file.");
    return;
  }

  let added = 0;
  entries.forEach((entry) => {
    const existing = starredChannels.get(entry.key);
    if (existing) {
      // Importing never unstars: keep our own star, fill in what we lack.
      starredChannels.set(entry.key, {
        ...existing,
        name: existing.name || entry.name,
        avatar: existing.avatar || entry.avatar,
      });
      return;
    }
    starredChannels.set(entry.key, entry);
    added += 1;
  });

  const saved = saveStarred();
  applyCurrentFilter();
  if (saved) {
    setFooterStatus(`Imported ${pluralChannels(entries.length)} (${added} new).`);
  }
}

function openExternal(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener");
}

function openInCurrentTab(url) {
  if (!url) return;
  window.location.href = url;
}

function renderCards(listEl, channels) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const fragment = document.createDocumentFragment();
  channels.forEach((channel) => {
    fragment.appendChild(createCard(channel));
  });
  listEl.appendChild(fragment);
}

function createCard(channel) {
  const card = document.createElement("div");
  card.className = "my-yt-subs-card";
  card.dataset.channelKey = starKey(channel.url);
  if (channel.isOrphan) {
    card.classList.add("is-orphan");
  }
  card.tabIndex = 0;

  // An empty src resolves to the page URL, so only add a real avatar.
  if (channel.avatar) {
    const avatar = document.createElement("img");
    avatar.className = "my-yt-subs-avatar";
    avatar.alt = `${channel.name} avatar`;
    // Off-screen rows should not fetch or decode until they scroll in, and the
    // intrinsic size keeps them out of layout.
    avatar.loading = "lazy";
    avatar.decoding = "async";
    avatar.width = 40;
    avatar.height = 40;
    avatar.src = shrinkAvatarUrl(channel.avatar);
    card.appendChild(avatar);
  }

  const name = document.createElement("div");
  name.className = "my-yt-subs-name";
  name.textContent = channel.name;
  card.appendChild(name);

  card.appendChild(createStarButton(channel));

  card.addEventListener("click", (event) => {
    if (event.target.closest(".my-yt-subs-star")) return;
    openExternal(normalizeUrl(channel.url));
  });
  card.addEventListener("keydown", (event) => {
    // The star button activates on Enter too, and that bubbles to the card.
    if (event.target !== card) return;
    if (event.key === "Enter") {
      openExternal(normalizeUrl(channel.url));
    }
  });

  return card;
}

function createStarButton(channel) {
  const starred = isStarred(channel.url);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "my-yt-subs-star";
  button.dataset.starKey = starKey(channel.url);
  button.setAttribute("aria-pressed", starred ? "true" : "false");

  const label = `${starred ? "Unstar" : "Star"} ${channel.name}`;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML =
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<path d="${STAR_PATH}" /></svg>`;

  button.addEventListener("click", (event) => {
    // Otherwise the card underneath opens the channel.
    event.stopPropagation();
    toggleStar(channel);
  });

  return button;
}

function loadCachedChannels() {
  let raw = null;
  try {
    raw = localStorage.getItem(CHANNELS_KEY);
  } catch (error) {
    console.warn("Cached subscriptions are unavailable", error);
    return [];
  }
  if (!raw) return [];

  try {
    const payload = JSON.parse(raw);
    const list = Array.isArray(payload) ? payload : payload?.channels;
    if (!Array.isArray(list)) return [];
    const channels = list
      .filter((item) => item?.name && item?.url)
      .map((item) => ({
        name: item.name,
        url: item.url,
        avatar: typeof item.avatar === "string" ? item.avatar : "",
      }));
    channelsFetchedAt = Number.isFinite(payload?.fetchedAt)
      ? payload.fetchedAt
      : 0;
    return dedupeChannels(channels);
  } catch (error) {
    console.warn("Ignoring unreadable cached subscriptions", error);
    return [];
  }
}

function saveCachedChannels() {
  channelsFetchedAt = Date.now();
  try {
    localStorage.setItem(
      CHANNELS_KEY,
      JSON.stringify({
        version: 1,
        fetchedAt: channelsFetchedAt,
        channels: allChannels,
      })
    );
  } catch (error) {
    // A missing cache only costs a fetch next time, so keep this quiet.
    console.warn("Failed to cache subscriptions", error);
  }
}

function updateRefreshLabel() {
  if (!elements.refreshButton) return;
  const label = channelsFetchedAt
    ? `Refresh subscriptions (updated ${describeAge(channelsFetchedAt)})`
    : "Refresh subscriptions";
  elements.refreshButton.title = label;
  elements.refreshButton.setAttribute("aria-label", label);
}

function describeAge(timestamp) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function setRefreshBusy(busy) {
  if (!elements.refreshButton) return;
  elements.refreshButton.disabled = busy;
  elements.refreshButton.classList.toggle("is-busy", busy);
}

function refreshStarredFromFeed() {
  // A starred channel that is still subscribed renders from the feed, but the
  // saved copy is what an orphan card and an export show. Keep it in step, so
  // a channel that renames itself and is later unsubscribed does not fall back
  // to a stale name.
  let changed = false;
  allChannels.forEach((channel) => {
    const key = starKey(channel.url);
    const entry = key && starredChannels.get(key);
    if (!entry) return;
    const avatar = channel.avatar || "";
    if (entry.name === channel.name && entry.avatar === avatar) return;
    starredChannels.set(key, { ...entry, name: channel.name, avatar });
    changed = true;
  });
  if (changed) {
    saveStarred();
  }
}

function orphanStarredChannels(feedKeys, normalizedQuery) {
  // Starred channels the feed no longer lists: unsubscribed, or a partial
  // parse. They render from what we saved when they were starred, and get
  // sorted in with the rest of the starred section.
  return Array.from(starredChannels.values())
    .filter((entry) => !feedKeys.has(entry.key))
    .filter(
      (entry) =>
        !normalizedQuery || entry.name.toLowerCase().includes(normalizedQuery)
    )
    .map((entry) => ({ ...entry, isOrphan: true }));
}

function sortByName(channels) {
  // Copy first: the no-query path aliases allChannels.
  return channels.slice().sort((a, b) => CHANNEL_COLLATOR.compare(a.name, b.name));
}

function applyCurrentFilter() {
  filterChannels(elements.searchInput?.value ?? "");
}

function filterChannels(query) {
  // Nothing to filter until the feed has loaded; keep the spinner on screen.
  if (isLoading) return;

  const normalized = query.trim().toLowerCase();
  const matches = normalized
    ? allChannels.filter((channel) =>
        channel.name.toLowerCase().includes(normalized)
      )
    : allChannels;

  const feedKeys = new Set(allChannels.map((channel) => starKey(channel.url)));
  const starred = [];
  const rest = [];
  matches.forEach((channel) => {
    if (isStarred(channel.url)) {
      starred.push(channel);
    } else {
      rest.push(channel);
    }
  });
  const starredCards = sortByName(
    starred.concat(orphanStarredChannels(feedKeys, normalized))
  );
  const restCards = sortByName(rest);

  renderCards(elements.starredListEl, starredCards);
  renderCards(elements.listEl, restCards);

  if (!starredCards.length && !restCards.length) {
    if (normalized) {
      showEmptyState("No channels match your search.", {
        bodyText: "Try a different search.",
        showActions: false,
        showSearch: true,
      });
    } else {
      // No subscriptions at all is not the same thing as being signed out.
      showEmptyState("No subscriptions found.", {
        bodyText: "Subscribe to a channel on YouTube, then reopen this overlay.",
        showActions: false,
        showSearch: true,
      });
    }
    return;
  }

  showSections(starredCards.length, restCards.length);
}

function findInitialDataStart(html) {
  // Matches `var ytInitialData = {` and `window["ytInitialData"] = {`.
  const pattern = /ytInitialData["'\]]*\s*=\s*/g;
  let match = pattern.exec(html);
  while (match) {
    const start = match.index + match[0].length;
    if (html[start] === "{") return start;
    match = pattern.exec(html);
  }
  return -1;
}

function extractJsonObject(html, start) {
  // Brace-match instead of stopping at the first `};`, which also appears
  // inside the payload's own strings.
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function parseInitialData(html) {
  const start = findInitialDataStart(html);
  if (start === -1) return null;
  const raw = extractJsonObject(html, start);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
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
      const avatar = pickThumbnail(renderer.thumbnail?.thumbnails);
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
      const avatar = shrinkAvatarUrl(img?.getAttribute("src") || "");
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

async function loadSubscriptions({ silent = false } = {}) {
  // A refresh already in flight owns the button and the status line.
  if (isFetching) return;
  isFetching = true;
  setRefreshBusy(true);

  if (silent) {
    setFooterStatus("Refreshing subscriptions...");
  } else {
    isLoading = true;
    setState("Loading subscriptions...");
  }

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
      // A refresh that finds nothing must not throw away a working list.
      if (silent) {
        setFooterStatus(
          hasSignedOutMarkers(html)
            ? "Could not refresh: sign in to YouTube again."
            : "Could not refresh: no subscriptions found."
        );
        return;
      }
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
    saveCachedChannels();
    refreshStarredFromFeed();
    isLoading = false;
    // Honour anything typed while the feed was still loading.
    applyCurrentFilter();
    if (silent) {
      setFooterStatus(`Updated ${pluralChannels(channels.length)}.`);
    }
  } catch (error) {
    console.error("Failed to load subscriptions", error);
    if (silent) {
      setFooterStatus("Could not refresh. Showing the saved list.");
    } else {
      showEmpty();
    }
  } finally {
    isLoading = false;
    isFetching = false;
    setRefreshBusy(false);
    updateRefreshLabel();
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
