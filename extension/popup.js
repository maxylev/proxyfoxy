const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let proxies = [];
let siteRules = {};
let currentProxyId = null;
let isConnected = false;
let currentDomain = null;
let sessionStart = null;
let uploadBytes = 0;
let downloadBytes = 0;
let selectedProtocol = "http";

// ─── Init ────────────────────────────────────────────────────────────

async function init() {
  const { theme } = await chrome.storage.local.get("theme");
  applyTheme(theme || "dark");
  await loadProxies();
  await loadSiteRules();
  await loadState();
  detectCurrentSite();
  renderProxies();
  bindEvents();
  startUptimeTimer();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// ─── Data Loaders ────────────────────────────────────────────────────

async function loadProxies() {
  const data = await chrome.storage.local.get("proxies");
  proxies = data.proxies || [];
}

async function loadSiteRules() {
  const data = await chrome.storage.local.get("siteRules");
  siteRules = data.siteRules || {};
}

async function loadState() {
  const state = await chrome.storage.local.get([
    "activeProxyId",
    "connected",
    "sessionStart",
    "uploadBytes",
    "downloadBytes",
    "lastProxyId",
  ]);
  if (state.activeProxyId) {
    currentProxyId = state.activeProxyId;
  } else if (state.lastProxyId) {
    currentProxyId = state.lastProxyId;
  }
  isConnected = state.connected || false;
  sessionStart = state.sessionStart || null;
  uploadBytes = state.uploadBytes || 0;
  downloadBytes = state.downloadBytes || 0;
  updateUI();
}

async function saveState() {
  await chrome.storage.local.set({
    activeProxyId: isConnected ? currentProxyId : null,
    connected: isConnected,
    sessionStart: sessionStart,
    uploadBytes: uploadBytes,
    downloadBytes: downloadBytes,
    lastProxyId: currentProxyId,
  });
}

// ─── Current Site Detection ──────────────────────────────────────────

function detectCurrentSite() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      try {
        const url = new URL(tabs[0].url);
        if (url.protocol === "http:" || url.protocol === "https:") {
          currentDomain = url.hostname;
          $("#currentDomain").textContent = currentDomain;
          updateSiteRuleUI();
        }
      } catch (e) {}
    }
  });
}

function updateSiteRuleUI() {
  const select = $("#siteRuleSelect");
  select.innerHTML =
    '<option value="">Use global proxy</option><option value="direct">Direct (no proxy)</option>';
  proxies.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name + " (" + p.protocol.toUpperCase() + ")";
    select.appendChild(opt);
  });
  if (currentDomain && siteRules[currentDomain]) {
    select.value = siteRules[currentDomain];
  }
}

// ─── Render ──────────────────────────────────────────────────────────

function renderProxies() {
  const select = $("#proxySelect");
  select.innerHTML = '<option value="">No proxy (Direct)</option>';
  proxies.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} — ${p.protocol.toUpperCase()} (${p.host}:${p.port})`;
    select.appendChild(opt);
  });
  if (currentProxyId) select.value = currentProxyId;
  updateSiteRuleUI();
  updateUI();
}

// ─── UI Update ───────────────────────────────────────────────────────

function updateUI() {
  const ring = $("#ringProgress");
  const ringGlow = $("#ringGlow");
  const label = $("#statusLabel");
  const ip = $("#statusIp");
  const toggleBtn = $("#toggleBtn");
  const indicator = $("#proxyIndicator");
  const selector = $(".proxy-selector");

  if (isConnected && currentProxyId) {
    ring.className = "ring-progress connected";
    ringGlow.classList.add("active");
    label.textContent = "Connected";
    label.className = "status-label status-connected";
    toggleBtn.classList.add("on");
    toggleBtn.disabled = false;
    if (indicator) indicator.classList.add("active");
    if (selector) selector.classList.add("active-proxy");

    const proxy = proxies.find((p) => p.id === currentProxyId);
    if (proxy) {
      ip.textContent = proxy.host + ":" + proxy.port;
      ip.title = proxy.host + ":" + proxy.port;
    }
    ip.classList.add("connected");

    updateBadge("ON");
    updateStats();
  } else {
    ring.className = currentProxyId ? "ring-progress off" : "ring-progress";
    ringGlow.classList.remove("active");
    label.textContent = "Disconnected";
    label.className = "status-label status-disconnected";
    ip.textContent = currentProxyId ? "Click to connect" : "Select a proxy";
    ip.title = "";
    ip.classList.remove("connected");
    toggleBtn.classList.remove("on");
    toggleBtn.disabled = !currentProxyId;
    if (indicator) indicator.classList.remove("active");
    if (selector) selector.classList.remove("active-proxy");
    updateBadge("");
  }
}

function updateBadge(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({
    color: text === "ON" ? "#10b981" : "#6b7280",
  });
}

// ─── Formatting ──────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + (s % 60) + "s";
  return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m";
}

function updateStats() {
  $("#statUploaded").textContent = formatBytes(uploadBytes);
  $("#statDownloaded").textContent = formatBytes(downloadBytes);
  if (sessionStart) {
    $("#statUptime").textContent = formatUptime(Date.now() - sessionStart);
  }
}

function startUptimeTimer() {
  setInterval(() => {
    if (isConnected && sessionStart) updateStats();
    if (isConnected) {
      chrome.runtime.sendMessage({ type: "getTrafficStats" }, (res) => {
        if (res) {
          uploadBytes = res.upload;
          downloadBytes = res.download;
          updateStats();
        }
      });
    }
  }, 1000);
}

// ─── Connect / Disconnect ────────────────────────────────────────────

async function connect() {
  const proxy = proxies.find((p) => p.id === currentProxyId);
  if (!proxy) return;
  isConnected = true;
  sessionStart = Date.now();
  uploadBytes = 0;
  downloadBytes = 0;
  updateUI();
  await saveState();

  chrome.runtime.sendMessage(
    { type: "connect", proxy: proxy, siteRules: siteRules },
    (response) => {
      if (response && response.ip) {
        $("#statusIp").textContent = response.ip;
        $("#statusIp").title = response.ip;
      }
    },
  );
}

async function disconnect() {
  isConnected = false;
  sessionStart = null;
  updateUI();
  await saveState();
  chrome.runtime.sendMessage({ type: "disconnect" });
}

// ─── Toast ───────────────────────────────────────────────────────────

function showToast(msg) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// ─── Smart Paste: Parse user:pass@host:port ──────────────────────────

function parseProxyString(str) {
  str = str.trim();
  let username = "",
    password = "",
    host = "",
    port = "";

  // Match user:pass@host:port
  const atMatch = str.match(/^(.+?):(.+?)@(.+)$/);
  if (atMatch) {
    username = atMatch[1];
    password = atMatch[2];
    const rest = atMatch[3];
    const portMatch = rest.match(/^(.+?):(\d+)$/);
    if (portMatch) {
      host = portMatch[1];
      port = portMatch[2];
    } else {
      host = rest;
    }
  } else {
    // Match host:port
    const portMatch = str.match(/^(.+?):(\d+)$/);
    if (portMatch) {
      host = portMatch[1];
      port = portMatch[2];
    } else {
      host = str;
    }
  }

  return { username, password, host, port };
}

function applyParsedProxy(parsed) {
  if (parsed.host) $("#proxyHost").value = parsed.host;
  if (parsed.port) $("#proxyPort").value = parsed.port;
  if (parsed.username) $("#proxyUser").value = parsed.username;
  if (parsed.password) $("#proxyPass").value = parsed.password;

  // Auto-detect residential protocol if username starts with "res_"
  if (parsed.username && parsed.username.startsWith("res_")) {
    $$(".pill").forEach((p) => p.classList.remove("active"));
    const resPill = document.querySelector('.pill[data-proto="residential"]');
    if (resPill) {
      resPill.classList.add("active");
      selectedProtocol = "residential";
    }
  }
}

// ─── Event Bindings ──────────────────────────────────────────────────

function bindEvents() {
  // Proxy selector change
  $("#proxySelect").addEventListener("change", async (e) => {
    const prevConnected = isConnected;
    if (isConnected) await disconnect();
    currentProxyId = e.target.value || null;
    await saveState();
    if (prevConnected && currentProxyId) await connect();
    updateUI();
  });

  // Power button toggle
  $("#toggleBtn").addEventListener("click", () => {
    if (isConnected) disconnect();
    else connect();
  });

  // Settings button → opens options page in new tab
  $("#settingsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Add Proxy button → open modal
  $("#addProxyBtn").addEventListener("click", () => {
    $("#modalOverlay").style.display = "flex";
    $("#proxyQuickPaste").focus();
  });

  // Modal close
  $("#modalClose").addEventListener("click", () => {
    $("#modalOverlay").style.display = "none";
  });
  $("#modalOverlay").addEventListener("click", (e) => {
    if (e.target === $("#modalOverlay")) {
      $("#modalOverlay").style.display = "none";
    }
  });

  // Protocol pills
  $$(".pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      $$(".pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      selectedProtocol = pill.dataset.proto;
    });
  });

  // ─── Smart Paste: Quick Add field ──────────────────────────────
  $("#proxyQuickPaste").addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (val.length < 3) return;
    const parsed = parseProxyString(val);
    if (parsed.host) applyParsedProxy(parsed);
  });

  // ─── Smart Paste: paste into individual fields ─────────────────
  ["#proxyHost", "#proxyPort", "#proxyUser", "#proxyPass"].forEach((sel) => {
    $(sel).addEventListener("paste", (e) => {
      const val = (e.clipboardData || window.clipboardData).getData("text");
      const parsed = parseProxyString(val);
      if (parsed.host && (parsed.port || parsed.username)) {
        e.preventDefault();
        applyParsedProxy(parsed);
      }
    });
  });

  // ─── Add Proxy Form Submit ─────────────────────────────────────
  $("#addProxyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const proxy = {
      id: "p_" + Date.now(),
      name: $("#proxyName").value.trim() || "Unnamed",
      protocol: selectedProtocol,
      host: $("#proxyHost").value.trim(),
      port: parseInt($("#proxyPort").value),
      username: $("#proxyUser").value.trim(),
      password: $("#proxyPass").value.trim(),
    };
    if (!proxy.host || !proxy.port) return;

    proxies.push(proxy);
    currentProxyId = proxy.id;
    await chrome.storage.local.set({ proxies });
    renderProxies();
    await saveState();
    $("#modalOverlay").style.display = "none";
    $("#addProxyForm").reset();
    $$(".pill").forEach((p) => p.classList.remove("active"));
    $$(".pill")[0].classList.add("active");
    selectedProtocol = "http";
    showToast("Proxy added: " + proxy.name);
  });

  // Manage button
  $("#manageBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Site rule change
  $("#siteRuleSelect").addEventListener("change", async (e) => {
    if (!currentDomain) return;
    const val = e.target.value;
    if (val) siteRules[currentDomain] = val;
    else delete siteRules[currentDomain];
    await chrome.storage.local.set({ siteRules });
    if (isConnected) {
      chrome.runtime.sendMessage({ type: "updateSiteRules", siteRules });
    }
    showToast(val ? "Rule set for " + currentDomain : "Rule removed");
  });
}

init();
