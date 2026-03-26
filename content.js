// content.js — Passive full parser for alpha.date v5

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

// ── MAP DOM STRUCTURE ────────────────────────────────────────────────────────
function mapDOMStructure() {
  const result = {};

  const rootMsgs = document.querySelectorAll('[class*="clmn_3_chat_message__"]');
  if (rootMsgs.length > 0) {
    const sample = rootMsgs[0];
    result.messageRoot = {
      sampleClass: sample.className,
      childrenClasses: Array.from(sample.children).map(c => c.className),
      count: rootMsgs.length
    };
  }

  const chatWrap = document.querySelector('[data-testid="profiles-block"]');
  if (chatWrap) {
    const cards = chatWrap.querySelectorAll('[class*="ProfilesList_clmn_1_profiles_item"], [class*="profile_item"], [class*="profileItem"], [class*="chat_item"], [class*="chatItem"]');
    result.chatList = {
      wrapClass: chatWrap.className,
      cardCount: cards.length,
      firstCardClass: cards[0]?.className || chatWrap.querySelector(':scope > div > div')?.className || ""
    };
  }

  return result;
}

// ── PARSE CHAT LIST ──────────────────────────────────────────────────────────
function parseChatList() {
  const chatWrap = document.querySelector('[data-testid="profiles-block"]');
  if (!chatWrap) return [];

  // Try specific card selectors first (from observed class patterns)
  const cardSelectors = [
    '[class*="clmn_1_mm_chat_list_item"]',
    '[class*="ProfilesList_clmn_1_profiles_item"]',
    '[class*="clmn_1_profiles_item"]',
    '[class*="profile_item"]',
    '[class*="profileItem"]',
    '[class*="chat_item"]',
    '[class*="chatItem"]'
  ];

  let cards = [];
  for (const sel of cardSelectors) {
    const found = chatWrap.querySelectorAll(sel);
    if (found.length > 0) { cards = Array.from(found); break; }
  }

  // Fallback: direct children divs that look like cards (have img + short text)
  if (cards.length === 0) {
    cards = Array.from(chatWrap.querySelectorAll(':scope > div > div, :scope > div'))
      .filter(el => {
        const hasImg = !!el.querySelector('img');
        const text = el.innerText.trim();
        const commaCount = (text.match(/,/g) || []).length;
        // A real card has an image OR short text (name, age) not merged
        return hasImg || (text.length > 3 && text.length < 80 && commaCount <= 2);
      });
  }

  const seen = new Set();
  return cards.map(card => {
    const imgEl = card.querySelector('img');
    const rawText = card.innerText.trim();
    const key = rawText.substring(0, 60);
    if (key.length < 2 || seen.has(key)) return null;
    seen.add(key);

    // Name: first image alt, or first short line
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const name = (imgEl && imgEl.alt) ? imgEl.alt : lines[0] || "";

    // Last message preview: dedicated element or second line
    const previewEl = card.querySelector('[class*="last_message"], [class*="lastMessage"], [class*="preview"], [class*="message_text"], [class*="messageText"]');
    const lastMessage = previewEl
      ? previewEl.innerText.trim().substring(0, 100)
      : lines.slice(1).join(' ').substring(0, 100);

    // Unread badge — usually a number in a small element
    const unreadEl = card.querySelector('[class*="unread"], [class*="badge"], [class*="counter"], [class*="count"]');
    const unreadCount = unreadEl ? unreadEl.innerText.trim() : "";

    // Online indicator
    const onlineEl = card.querySelector('[class*="online"]');
    const isOnline = !!onlineEl;

    return { name, avatar: imgEl ? imgEl.src : "", lastMessage, unreadCount, isOnline };
  }).filter(Boolean);
}

// ── PARSE MESSAGES ───────────────────────────────────────────────────────────
function parseMessages() {
  const allMsgEls = document.querySelectorAll('[class*="clmn_3_chat_message__"]');

  // Root messages only: have id="mess-XXXXX" or data-testid="sent/received-message-XXX"
  const rootMsgs = Array.from(allMsgEls).filter(el =>
    el.id.startsWith("mess-") ||
    (el.dataset.testid && (
      el.dataset.testid.startsWith("sent-message") ||
      el.dataset.testid.startsWith("received-message")
    ))
  );

  return rootMsgs.map((el, i) => {
    const cls = el.className;
    const isFromHer = cls.includes("right"); // operator (girl side)
    const isFromMan = cls.includes("left");  // man (client)

    // Text
    const textEl = el.querySelector('[data-testid="message-text"]');
    const text = textEl ? textEl.innerText.trim() : "";

    // Image
    const imgEl = el.querySelector('[data-testid="message-image"] img, img[data-testid]');
    let imageUrl = "", imageFilename = "";
    if (imgEl) {
      imageUrl = imgEl.src || "";
      imageFilename = imgEl.dataset.testid || imgEl.alt || "";
    }

    // Time
    const timeEl = el.querySelector('[data-testid="message-date"]');
    const time = timeEl ? timeEl.innerText.trim() : "";

    // Read status (only exists on operator's sent messages)
    const statusEl = el.querySelector('[data-testid="message-status"]');
    const isRead = statusEl
      ? statusEl.className.includes("readed") || statusEl.className.includes("read")
      : null;

    // Sticker / gift
    const stickerEl = el.querySelector('[data-testid="message-sticker"], [data-testid="message-gift"]');
    const stickerType = stickerEl ? stickerEl.dataset.testid.replace("message-", "") : "";

    // Avatar — only on man's messages (left side), NOT operator messages
    const avatarWrap = el.querySelector('[data-testid="message-avatar"]');
    const avatarEl = avatarWrap ? avatarWrap.querySelector('img') : null;
    const manAvatarUrl = (isFromMan && avatarEl) ? avatarEl.src : "";

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
      msg.type = stickerType;
    } else if (text) {
      msg.type = "text";
    } else {
      msg.type = "unknown";
    }

    // Only add avatar for man's messages
    if (manAvatarUrl) msg.manAvatarUrl = manAvatarUrl;

    return msg;
  });
}

// ── PARSE NOTIFICATIONS ──────────────────────────────────────────────────────
function parseNotifications() {
  const results = [];
  const seen = new Set();

  document.querySelectorAll('[class*="Notification"], [class*="notification"], [class*="toast"], [class*="Toast"]')
    .forEach(el => {
      // Try to parse structured notification: "Name, age\nPlease write him message"
      const lines = el.innerText.trim().split('\n').map(l => l.trim()).filter(Boolean);

      // Skip header lines like "Notifications" / "Clear all"
      const meaningful = lines.filter(l =>
        !["notifications", "сповіщення", "clear all", "очистити все", "notes", "нотатки"].includes(l.toLowerCase())
      );

      if (meaningful.length === 0) return;

      // Try to extract man's name+age from first meaningful line
      const firstLine = meaningful[0];
      const nameAgeMatch = firstLine.match(/^(.+),\s*(\d+)$/);

      const entry = nameAgeMatch
        ? { manName: nameAgeMatch[1].trim(), manAge: nameAgeMatch[2], message: meaningful.slice(1).join(' ') }
        : { raw: meaningful.join(' ').substring(0, 200) };

      const key = JSON.stringify(entry);
      if (!seen.has(key)) { seen.add(key); results.push(entry); }
    });

  return results;
}

// ── PARSE PROFILE ────────────────────────────────────────────────────────────
function parseProfile() {
  const nameEl = document.querySelector(
    '[data-testid="profile-name"], [class*="profile_name"], [class*="profileName"], [class*="profile-name"]'
  ) || document.querySelector('h1');

  if (!nameEl) return null;
  const profile = { name: nameEl.innerText.trim() };

  const ageEl = document.querySelector('[data-testid="profile-age"], [class*="profile_age"], [class*="profileAge"]');
  if (ageEl) profile.age = ageEl.innerText.trim().replace(/\D/g, "");

  const cityEl = document.querySelector('[data-testid="profile-city"], [class*="city"], [class*="location"]');
  if (cityEl) profile.city = cityEl.innerText.trim();

  const pathParts = window.location.pathname.split("/");
  const lastPart = pathParts[pathParts.length - 1];
  if (/^\d+$/.test(lastPart)) profile.userId = lastPart;

  const aboutEl = document.querySelector('[data-testid="profile-about"], [class*="about"]');
  if (aboutEl) profile.about = aboutEl.innerText.trim().substring(0, 300);

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
  snapshot.domStructure = mapDOMStructure();

  // ── DEDUP ──────────────────────────────────────────────────────────────────
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
