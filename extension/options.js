const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let proxies = [];
let siteRules = {};
let optProtocol = "http";
let editingIndex = -1;

// ─── Init ────────────────────────────────────────────────────────────

async function init() {
  const { theme } = await chrome.storage.local.get("theme");
  applyTheme(theme || "dark");
  await loadData();
  renderProxies();
  renderRules();
  bindNav();
  bindEvents();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $$(".theme-option").forEach((b) =>
    b.classList.toggle("active", b.dataset.theme === theme),
  );
}

async function loadData() {
  const data = await chrome.storage.local.get(["proxies", "siteRules"]);
  proxies = data.proxies || [];
  siteRules = data.siteRules || {};
}

// ─── Render ──────────────────────────────────────────────────────────

function renderProxies() {
  const list = $("#proxyList");
  const empty = $("#emptyProxies");
  const cards = list.querySelectorAll(".proxy-card");
  cards.forEach((c) => c.remove());

  if (proxies.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  proxies.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "proxy-card";
    card.innerHTML = `
      <div class="proxy-icon ${p.protocol}">${p.protocol === "socks5" ? "S5" : p.protocol === "residential" ? "RES" : "HTTP"}</div>
      <div class="proxy-info">
        <div class="proxy-name">${esc(p.name)}</div>
        <div class="proxy-detail">${esc(p.host)}:${p.port} · ${p.protocol.toUpperCase()}${p.username ? " · " + esc(p.username) : ""}</div>
      </div>
      <div class="proxy-actions">
        <button class="edit" data-idx="${i}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="delete" data-idx="${i}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;
    list.appendChild(card);
  });
}

function renderRules() {
  const list = $("#rulesList");
  const empty = $("#emptyRules");
  const cards = list.querySelectorAll(".rule-card");
  cards.forEach((c) => c.remove());

  const entries = Object.entries(siteRules);
  if (entries.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  entries.forEach(([domain, proxyId]) => {
    const proxy =
      proxyId === "direct" ? null : proxies.find((p) => p.id === proxyId);
    const target =
      proxyId === "direct" ? "Direct" : proxy ? proxy.name : "(deleted)";

    const card = document.createElement("div");
    card.className = "rule-card";
    card.innerHTML = `
      <div class="rule-domain">${esc(domain)}</div>
      <div class="rule-target">${esc(target)}</div>
      <button class="rule-delete" data-domain="${esc(domain)}" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    list.appendChild(card);
  });
}

function populateRuleProxySelect() {
  const sel = $("#ruleProxy");
  sel.innerHTML = '<option value="direct">Direct (no proxy)</option>';
  proxies.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name + " (" + p.protocol.toUpperCase() + ")";
    sel.appendChild(opt);
  });
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function showToast(msg) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// ─── Smart Paste ─────────────────────────────────────────────────────

function parseProxyString(str) {
  str = str.trim();
  let username = "",
    password = "",
    host = "",
    port = "";

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

function applyParsedProxyOpt(parsed) {
  if (parsed.host) $("#optProxyHost").value = parsed.host;
  if (parsed.port) $("#optProxyPort").value = parsed.port;
  if (parsed.username) $("#optProxyUser").value = parsed.username;
  if (parsed.password) $("#optProxyPass").value = parsed.password;

  // Auto-detect residential protocol
  if (parsed.username && parsed.username.startsWith("res_")) {
    $$("#optProtocolPills .pill").forEach((p) => p.classList.remove("active"));
    const resPill = document.querySelector(
      '#optProtocolPills .pill[data-proto="residential"]',
    );
    if (resPill) {
      resPill.classList.add("active");
      optProtocol = "residential";
    }
  }
}

// ─── Nav ─────────────────────────────────────────────────────────────

function bindNav() {
  $$(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      $$(".nav-link").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      $$(".section").forEach((s) => s.classList.remove("active"));
      $("#section-" + link.dataset.section).classList.add("active");
    });
  });
}

// ─── Events ──────────────────────────────────────────────────────────

function bindEvents() {
  // Add Proxy button
  $("#addProxyBtn2").addEventListener("click", () => {
    const form = $("#addProxyFormFull");
    editingIndex = -1;
    $("#saveAddProxy").textContent = "Save Proxy";
    form.querySelector("h3").textContent = "New Proxy";
    form.style.display = form.style.display === "none" ? "block" : "none";
    if (form.style.display === "block") {
      $("#optProxyQuickPaste").focus();
    }
  });

  $("#cancelAddProxy").addEventListener("click", () => {
    editingIndex = -1;
    $("#saveAddProxy").textContent = "Save Proxy";
    $("#addProxyFormFull").querySelector("h3").textContent = "New Proxy";
    $("#addProxyFormFull").style.display = "none";
  });

  // Protocol pills
  $$("#optProtocolPills .pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      $$("#optProtocolPills .pill").forEach((p) =>
        p.classList.remove("active"),
      );
      pill.classList.add("active");
      optProtocol = pill.dataset.proto;
    });
  });

  // ─── Smart Paste: Quick Add field in options ───────────────────
  $("#optProxyQuickPaste").addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (val.length < 3) return;
    const parsed = parseProxyString(val);
    if (parsed.host) applyParsedProxyOpt(parsed);
  });

  // ─── Smart Paste: paste into individual fields ─────────────────
  ["#optProxyHost", "#optProxyPort", "#optProxyUser", "#optProxyPass"].forEach(
    (sel) => {
      $(sel).addEventListener("paste", (e) => {
        const val = (e.clipboardData || window.clipboardData).getData("text");
        const parsed = parseProxyString(val);
        if (parsed.host && (parsed.port || parsed.username)) {
          e.preventDefault();
          applyParsedProxyOpt(parsed);
        }
      });
    },
  );

  // Save Proxy
  $("#saveAddProxy").addEventListener("click", async () => {
    const name = $("#optProxyName").value.trim() || "Unnamed";
    const host = $("#optProxyHost").value.trim();
    const port = parseInt($("#optProxyPort").value);

    if (!host || !port) {
      showToast("Please fill in host and port");
      return;
    }

    const proxy = {
      id: editingIndex >= 0 ? proxies[editingIndex].id : "p_" + Date.now(),
      name,
      protocol: optProtocol,
      host,
      port,
      username: $("#optProxyUser").value.trim(),
      password: $("#optProxyPass").value.trim(),
    };

    if (editingIndex >= 0) {
      proxies[editingIndex] = proxy;
      editingIndex = -1;
    } else {
      proxies.push(proxy);
    }

    await chrome.storage.local.set({ proxies });
    renderProxies();
    populateRuleProxySelect();
    $("#addProxyFormFull").style.display = "none";
    $("#optProxyName").value = "";
    $("#optProxyQuickPaste").value = "";
    $("#optProxyHost").value = "";
    $("#optProxyPort").value = "";
    $("#optProxyUser").value = "";
    $("#optProxyPass").value = "";
    $("#saveAddProxy").textContent = "Save Proxy";
    $("#addProxyFormFull").querySelector("h3").textContent = "New Proxy";
    showToast("Proxy saved: " + name);
  });

  // Proxy list click handlers
  $("#proxyList").addEventListener("click", async (e) => {
    const deleteBtn = e.target.closest(".delete");
    if (deleteBtn) {
      const idx = parseInt(deleteBtn.dataset.idx);
      const name = proxies[idx].name;
      proxies.splice(idx, 1);
      await chrome.storage.local.set({ proxies });
      renderProxies();
      populateRuleProxySelect();
      showToast("Deleted: " + name);
      return;
    }

    const editBtn = e.target.closest(".edit");
    if (editBtn) {
      const idx = parseInt(editBtn.dataset.idx);
      const p = proxies[idx];
      editingIndex = idx;
      $("#optProxyName").value = p.name;
      $("#optProxyHost").value = p.host;
      $("#optProxyPort").value = p.port;
      $("#optProxyUser").value = p.username || "";
      $("#optProxyPass").value = p.password || "";
      optProtocol = p.protocol;
      $$("#optProtocolPills .pill").forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.proto === p.protocol);
      });
      $("#addProxyFormFull").style.display = "block";
      $("#saveAddProxy").textContent = "Update Proxy";
      $("#addProxyFormFull").querySelector("h3").textContent = "Edit Proxy";
    }
  });

  // Add Rule
  $("#addRuleBtn").addEventListener("click", () => {
    populateRuleProxySelect();
    const form = $("#addRuleForm");
    form.style.display = form.style.display === "none" ? "block" : "none";
  });

  $("#cancelAddRule").addEventListener("click", () => {
    $("#addRuleForm").style.display = "none";
  });

  $("#saveAddRule").addEventListener("click", async () => {
    const domain = $("#ruleDomain").value.trim();
    const proxyId = $("#ruleProxy").value;
    if (!domain) {
      showToast("Please enter a domain");
      return;
    }
    siteRules[domain] = proxyId;
    await chrome.storage.local.set({ siteRules });
    renderRules();
    $("#addRuleForm").style.display = "none";
    $("#ruleDomain").value = "";
    showToast("Rule added for " + domain);
  });

  // Rule delete
  $("#rulesList").addEventListener("click", async (e) => {
    const btn = e.target.closest(".rule-delete");
    if (btn) {
      const domain = btn.dataset.domain;
      delete siteRules[domain];
      await chrome.storage.local.set({ siteRules });
      renderRules();
      showToast("Rule removed for " + domain);
    }
  });

  // Theme
  $$(".theme-option").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      await chrome.storage.local.set({ theme });
      showToast("Theme: " + theme);
    });
  });

  // Reset All
  $("#resetAllBtn").addEventListener("click", async () => {
    if (
      confirm("This will remove all proxies, rules, and settings. Continue?")
    ) {
      proxies = [];
      siteRules = {};
      await chrome.storage.local.clear();
      renderProxies();
      renderRules();
      showToast("All data reset");
    }
  });
}

init();
