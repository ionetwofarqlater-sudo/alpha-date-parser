const toggleBtn = document.getElementById("toggleBtn");
const statusEl = document.getElementById("status");

function updateUI(enabled, count) {
  toggleBtn.textContent = enabled ? "● ON — collecting" : "○ OFF — paused";
  toggleBtn.className = enabled ? "on" : "off";
  statusEl.textContent = `Snapshots collected: ${count}`;
}

chrome.storage.local.get(["alphaData", "alphaEnabled"], result => {
  const enabled = result.alphaEnabled !== false; // default ON
  updateUI(enabled, (result.alphaData || []).length);
});

toggleBtn.addEventListener("click", () => {
  chrome.storage.local.get(["alphaData", "alphaEnabled"], result => {
    const current = result.alphaEnabled !== false;
    const next = !current;
    chrome.storage.local.set({ alphaEnabled: next }, () => {
      updateUI(next, (result.alphaData || []).length);
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
