// content.js — Passive full parser for alpha.date v4

let lastSnapshotKey = "";

function detectPageType() {
  const url = window.location.href;
  if (url.includes("/chat")) return "chat";
  if (url.includes("/letters")) return "letters";
  if (url.includes("/likes") || url.includes("/matches")) return "likes";
  if (url.includes("/profile")) return "profile";
  if (url.includes("/operator-statistic")) return "statistic";
  if (url.includes("/favorite")) return "favorite";
  return "other";
}

// ── MAP DOM STRUCTURE (one-time snapshot of all unique class patterns) ──────
function mapDOMStructure() {
  const result = {};

  // Message root elements
  const rootMsgs = document.querySelectorAll('[class*="clmn_3_chat_message__"]');
  if (rootMsgs.length > 0) {
    const sample = rootMsgs[0];
    result.messageRoot = {
      selector: '[class*="clmn_3_chat_message__"]',
      sampleClass: sample.className,
      childrenClasses: Array.from(sample.children).map(c => c.className),
      hasDataTestid: !!sample.dataset.testid,
      count: rootMsgs.length
    };
  }

  // Chat list
  const chatWrap = document.querySelector('[data-testid="profiles-block"]');
  if (chatWrap) {
    const firstCard = chatWrap.querySelector(':scope > div > div, :scope > div');
    result.chatList = {
      wrapClass: chatWrap.className,
      firstCardClass: firstCard?.className || "",
      count: chatWrap.querySelectorAll(':scope > div').length
    };
  }

  // Letters
  const letterList = document.querySelector('[class*="LettersList"], [class*="letters-list"], [class*="Letters_"]');
  if (letterList) {
    result.letters = {
      wrapClass: letterList.className,
      itemCount: letterList.querySelectorAll(':scope > div').length
    };
  }

  // Profile
  const h1 = document.querySelector('h1');
  if (h1) result.profileName = { tag: 'h1', text: h1.innerText.trim().substring(0, 40) };

  return result;
}

// ── PARSE CHAT LIST ──────────────────────────────────────────────────────────
function parseChatList() {
  const chatWrap = document.querySelector('[data-testid="profiles-block"]');
  if (!chatWrap) return [];

  const seen = new Set();
  const result = [];

  // Each direct child of profiles-block is a conversation card
  chatWrap.querySelectorAll(':scope > div').forEach(card => {
    // Name + age typically in a single short element
    const nameEl = card.querySelector('[class*="name"], [class*="Name"]') ||
                   card.querySelector('span, p');
    const avatarEl = card.querySelector('img');
    const lastMsgEl = card.querySelector('[class*="last"], [class*="preview"], [class*="message"]');
    const unreadEl = card.querySelector('[class*="unread"], [class*="badge"], [class*="count"]');
    const onlineEl = card.querySelector('[class*="online"], [class*="status"]');

    // Fallback: just use innerText if short
    const rawText = card.innerText.trim();
    const key = rawText.substring(0, 60);

    if (key.length < 3 || seen.has(key)) return;

    // Skip the merged "all names" entry
    if ((rawText.match(/,/g) || []).length > 3 && rawText.length > 80) return;

    seen.add(key);
    result.push({
      name: nameEl ? nameEl.innerText.trim() : rawText.split('\n')[0].trim(),
      avatar: avatarEl ? avatarEl.src : "",
      lastMessage: lastMsgEl ? lastMsgEl.innerText.trim().substring(0, 100) : "",
      unreadCount: unreadEl ? unreadEl.innerText.trim() : "",
      isOnline: !!onlineEl,
      rawText: rawText.substring(0, 150)
    });
  });

  return result;
}

// ── PARSE MESSAGES ───────────────────────────────────────────────────────────
function parseMessages() {
  // Only select ROOT message divs (not nested children)
  // Root messages have id="mess-XXXXX" OR data-testid="sent-message-XXX"/"received-message-XXX"
  const allMsgEls = document.querySelectorAll('[class*="clmn_3_chat_message__"]');

  // Filter to only root messages (those that contain clmn_3_chat_message__ AND have id or testid)
  const rootMsgs = Array.from(allMsgEls).filter(el => {
    return el.id.startsWith("mess-") ||
           (el.dataset.testid && (
             el.dataset.testid.startsWith("sent-message") ||
             el.dataset.testid.startsWith("received-message")
           ));
  });

  return rootMsgs.map((el, i) => {
    const cls = el.className;
    const isFromHer = cls.includes("right"); // operator wrote this
    const isFromMan = cls.includes("left");  // man (client) wrote this

    // Text content
    const textEl = el.querySelector('[data-testid="message-text"]');
    const text = textEl ? textEl.innerText.trim() : "";

    // Image message
    const imgEl = el.querySelector('[data-testid="message-image"] img, img[data-testid]');
    let imageUrl = "";
    let imageFilename = "";
    if (imgEl) {
      imageUrl = imgEl.src || "";
      imageFilename = imgEl.dataset.testid || imgEl.alt || "";
    }

    // Time / date
    const timeEl = el.querySelector('[data-testid="message-date"]');
    const time = timeEl ? timeEl.innerText.trim() : "";

    // Read status
    const statusEl = el.querySelector('[data-testid="message-status"]');
    const isRead = statusEl ? statusEl.className.includes("readed") || statusEl.className.includes("read") : null;

    // Sticker / gift (look for non-standard testids)
    const stickerEl = el.querySelector('[data-testid="message-sticker"], [data-testid="message-gift"]');
    const stickerType = stickerEl ? stickerEl.dataset.testid : "";

    // Avatar (left messages = man's avatar)
    const avatarEl = el.querySelector('[data-testid="message-avatar"] img');
    const avatarUrl = avatarEl ? avatarEl.src : "";

    const msg = {
      index: i,
      id: el.id.replace("mess-", ""),
      isFromHer,
      isFromMan,
      time,
      isRead
    };

    if (text) msg.text = text;
    if (imageUrl) {
      msg.type = "image";
      msg.imageUrl = imageUrl;
      if (imageFilename) msg.imageFilename = imageFilename;
    } else if (stickerType) {
      msg.type = stickerType.replace("message-", "");
    } else if (text) {
      msg.type = "text";
    } else {
      msg.type = "unknown";
    }
    if (avatarUrl) msg.avatarUrl = avatarUrl;

    return msg;
  });
}

// ── PARSE PROFILE ────────────────────────────────────────────────────────────
function parseProfile() {
  // Try multiple selectors for profile name
  const nameEl = document.querySelector(
    '[data-testid="profile-name"], [class*="profile_name"], [class*="profileName"], [class*="profile-name"]'
  ) || document.querySelector('h1');

  if (!nameEl) return null;

  const profile = { name: nameEl.innerText.trim() };

  // Age
  const ageEl = document.querySelector('[data-testid="profile-age"], [class*="profile_age"], [class*="profileAge"]');
  if (ageEl) profile.age = ageEl.innerText.trim().replace(/\D/g, "");

  // City / country
  const cityEl = document.querySelector('[data-testid="profile-city"], [class*="city"], [class*="location"]');
  if (cityEl) profile.city = cityEl.innerText.trim();

  // User ID (often in URL or in a data attribute)
  const pathParts = window.location.pathname.split("/");
  const lastPart = pathParts[pathParts.length - 1];
  if (/^\d+$/.test(lastPart)) profile.userId = lastPart;

  // About
  const aboutEl = document.querySelector('[data-testid="profile-about"], [class*="about"]');
  if (aboutEl) profile.about = aboutEl.innerText.trim().substring(0, 300);

  // Avatar
  const avatarEl = document.querySelector('[data-testid="profile-avatar"] img, [class*="profile_avatar"] img');
  if (avatarEl) profile.avatar = avatarEl.src;

  return profile;
}

// ── PARSE LETTERS ────────────────────────────────────────────────────────────
function parseLetters() {
  const letterWrap = document.querySelector(
    '[class*="LettersList"], [class*="letters_list"], [class*="lettersList"], [class*="Letters_"]'
  );
  if (!letterWrap) return [];

  return Array.from(letterWrap.querySelectorAll(':scope > div, :scope > li, :scope > article'))
    .filter(el => el.innerText.trim().length > 5)
    .map(el => {
      const nameEl = el.querySelector('[class*="name"], [class*="Name"]');
      const subjectEl = el.querySelector('[class*="subject"], [class*="Subject"]');
      const previewEl = el.querySelector('[class*="preview"], [class*="Preview"], [class*="body"]');
      const dateEl = el.querySelector('[class*="date"], [class*="time"], time');
      const unreadEl = el.querySelector('[class*="unread"], [class*="new"]');

      return {
        name: nameEl ? nameEl.innerText.trim() : "",
        subject: subjectEl ? subjectEl.innerText.trim() : "",
        preview: previewEl ? previewEl.innerText.trim().substring(0, 300) : el.innerText.trim().substring(0, 200),
        date: dateEl ? dateEl.innerText.trim() : "",
        isUnread: !!unreadEl
      };
    });
}

// ── PARSE NOTIFICATIONS ──────────────────────────────────────────────────────
function parseNotifications() {
  const seen = new Set();
  document.querySelectorAll('[class*="Notification"], [class*="notification"], [class*="toast"], [class*="Toast"]')
    .forEach(el => {
      const t = el.innerText.trim();
      if (t.length > 2) seen.add(t.substring(0, 200));
    });
  return Array.from(seen);
}

// ── MAIN EXTRACT ─────────────────────────────────────────────────────────────
function extractAllVisibleData() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    pageType: detectPageType(),
    chatId: window.location.pathname.split("/").pop() || "",
    chatList: [],
    messages: [],
    profiles: [],
    letters: [],
    notifications: [],
    domStructure: null
  };

  snapshot.chatList = parseChatList();
  snapshot.messages = parseMessages();

  const profile = parseProfile();
  if (profile && profile.name) snapshot.profiles.push(profile);

  snapshot.letters = parseLetters();
  snapshot.notifications = parseNotifications();

  // Include DOM structure map for diagnostics
  snapshot.domStructure = mapDOMStructure();

  // ── DEDUP ─────────────────────────────────────────────────────────────────
  const msgs = snapshot.messages;
  const key = snapshot.url + "|" +
    msgs.length + "|" +
    (msgs[0]?.id || "") + "|" +
    (msgs[msgs.length - 1]?.id || "") + "|" +
    snapshot.chatList.length;

  if (key === lastSnapshotKey) return;
  lastSnapshotKey = key;

  const hasData =
    snapshot.chatList.length > 0 ||
    snapshot.messages.length > 0 ||
    snapshot.profiles.length > 0 ||
    snapshot.letters.length > 0;

  if (hasData) saveSnapshot(snapshot);
}

// ── SAVE ──────────────────────────────────────────────────────────────────────
function saveSnapshot(snapshot) {
  chrome.storage.local.get(["alphaData", "alphaEnabled"], result => {
    if (result.alphaEnabled === false) return;
    let all = result.alphaData || [];
    all.push(snapshot);
    if (all.length > 500) all = all.slice(-450);
    chrome.storage.local.set({ alphaData: all });
  });
}

// ── OBSERVER ─────────────────────────────────────────────────────────────────
let lastRun = 0;
const observer = new MutationObserver(() => {
  const now = Date.now();
  if (now - lastRun > 3000) {
    lastRun = now;
    extractAllVisibleData();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

setTimeout(extractAllVisibleData, 1500);
setInterval(extractAllVisibleData, 5000);

// Debug helpers
window._getAlphaData = () => chrome.storage.local.get(["alphaData"], r => console.log(JSON.stringify(r.alphaData, null, 2)));
window._clearAlphaData = () => chrome.storage.local.set({ alphaData: [] });
window._getLastSnapshot = () => chrome.storage.local.get(["alphaData"], r => {
  const d = r.alphaData || [];
  console.log(JSON.stringify(d[d.length - 1], null, 2));
});
