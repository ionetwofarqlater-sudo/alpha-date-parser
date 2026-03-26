// content.js — Passive full parser for alpha.date v3

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
    notifications: []
  };

  // --- Chat list (унікальні картки з іменем) ---
  const chatWrap = document.querySelector('[data-testid="profiles-block"]');
  if (chatWrap) {
    const seen = new Set();
    chatWrap.querySelectorAll(':scope > div > div, :scope > div').forEach(el => {
      const t = el.innerText.trim();
      // пропускаємо порожні і злиті (містять всі імена разом)
      if (t.length > 3 && t.length < 100 && !seen.has(t)) {
        seen.add(t);
        snapshot.chatList.push(t);
      }
    });
  }

  // --- Повідомлення (тільки кореневий div повідомлення, без дочірніх дублів) ---
  const msgEls = document.querySelectorAll('[class*="clmn_3_chat_message__"]');
  snapshot.messages = Array.from(msgEls)
    .filter(el => el.innerText.trim().length > 0)
    .map((el, i) => {
      const textEl = el.querySelector('[data-testid="message-text"]');
      const timeEl = el.querySelector('[data-testid="message-date"]');
      const rawId = el.id || "";
      return {
        index: i,
        id: rawId.replace("mess-", ""),
        text: textEl ? textEl.innerText.trim() : el.innerText.trim(),
        time: timeEl ? timeEl.innerText.trim() : "",
        isFromHer: el.className.includes("right")
      };
    });

  // --- Профіль відкритого користувача ---
  const nameEl = document.querySelector('h1, [class*="profile-name"], [class*="ProfileName"]');
  if (nameEl) {
    const profile = { name: nameEl.innerText.trim() };
    const ageEl = document.querySelector('[class*="age"], [class*="Age"]');
    if (ageEl) profile.age = ageEl.innerText.trim();
    const cityEl = document.querySelector('[class*="city"], [class*="location"], [class*="City"]');
    if (cityEl) profile.city = cityEl.innerText.trim();
    const idEl = document.querySelector('[class*="user-id"], [class*="userId"]');
    if (idEl) profile.userId = idEl.innerText.trim();
    if (profile.name) snapshot.profiles.push(profile);
  }

  // --- Letters ---
  const letterList = document.querySelector('[class*="LettersList"], [class*="letters-list"], [class*="Letters_"]');
  if (letterList) {
    snapshot.letters = Array.from(letterList.querySelectorAll(':scope > div'))
      .filter(el => el.innerText.trim().length > 5)
      .map(el => ({
        text: el.innerText.trim().substring(0, 400),
        html: el.outerHTML.substring(0, 600)
      }));
  }

  // --- Notifications ---
  const notifTexts = new Set();
  document.querySelectorAll('[class*="Notification"], [class*="notification"]').forEach(el => {
    const t = el.innerText.trim();
    if (t.length > 2) notifTexts.add(t.substring(0, 200));
  });
  snapshot.notifications = Array.from(notifTexts);

  // --- Dedup ---
  const key = snapshot.url + "|" +
    snapshot.messages.length + "|" +
    (snapshot.messages[0]?.id || "") + "|" +
    (snapshot.messages[snapshot.messages.length - 1]?.id || "");

  if (key === lastSnapshotKey) return;
  lastSnapshotKey = key;

  const hasData =
    snapshot.chatList.length > 0 ||
    snapshot.messages.length > 0 ||
    snapshot.profiles.length > 0 ||
    snapshot.letters.length > 0;

  if (hasData) saveSnapshot(snapshot);
}

function saveSnapshot(snapshot) {
  chrome.storage.local.get(["alphaData", "alphaEnabled"], result => {
    if (result.alphaEnabled === false) return;
    let all = result.alphaData || [];
    all.push(snapshot);
    if (all.length > 500) all = all.slice(-450);
    chrome.storage.local.set({ alphaData: all });
  });
}

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

window._getAlphaData = () => chrome.storage.local.get(["alphaData"], r => console.log(JSON.stringify(r.alphaData, null, 2)));
window._clearAlphaData = () => chrome.storage.local.set({ alphaData: [] });
