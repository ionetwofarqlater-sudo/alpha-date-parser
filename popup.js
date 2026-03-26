const toggleBtn = document.getElementById("toggleBtn");
const statusEl = document.getElementById("status");

document.getElementById("version").textContent = "v" + chrome.runtime.getManifest().version;

function formatStats(data) {
  if (!data || data.length === 0) return "No snapshots yet";
  const last = data[data.length - 1];
  const msgCount = data.reduce((s, d) => s + (d.messages ? d.messages.length : 0), 0);
  const uniqueChats = new Set(data.map(d => d.chatId).filter(Boolean)).size;
  const lastTime = last.timestamp ? new Date(last.timestamp).toLocaleTimeString() : "";
  return `${data.length} snapshots | ${msgCount} messages | ${uniqueChats} chats\nLast: ${lastTime}`;
}

function updateUI(enabled, data) {
  toggleBtn.textContent = enabled ? "● ON — collecting" : "○ OFF — paused";
  toggleBtn.className = enabled ? "on" : "off";
  statusEl.textContent = formatStats(data);
}

chrome.storage.local.get(["alphaData", "alphaEnabled"], result => {
  const enabled = result.alphaEnabled !== false;
  updateUI(enabled, result.alphaData || []);
});

toggleBtn.addEventListener("click", () => {
  chrome.storage.local.get(["alphaData", "alphaEnabled"], result => {
    const next = !(result.alphaEnabled !== false);
    chrome.storage.local.set({ alphaEnabled: next }, () => {
      updateUI(next, result.alphaData || []);
    });
  });
});

document.getElementById("export").addEventListener("click", () => {
  chrome.storage.local.get(["alphaData"], result => {
    const data = result.alphaData || [];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alpha_data_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

document.getElementById("clear").addEventListener("click", () => {
  chrome.storage.local.set({ alphaData: [] }, () => {
    statusEl.textContent = "Cleared.";
  });
});
