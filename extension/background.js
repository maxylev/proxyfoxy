let activeProxy = null;
let authListener = null;

// ─── Clear stale proxy settings on startup ────────────────────────────
// Prevents ERR_TUNNEL_CONNECTION_FAILED from a previous session where
// proxy settings were left active but the proxy server is no longer
// reachable (e.g. browser restarted, different network).

chrome.proxy.settings.clear({ scope: "regular" });
chrome.storage.local.remove(["connected", "activeProxyId", "sessionStart"]);

// ─── Proxy Auth Handler (MV3 asyncBlocking) ───────────────────────────
// Chrome MV3 requires the "webRequestAuthProvider" permission and the
// "asyncBlocking" extraInfoSpec.  The listener receives an asyncCallback
// as its second argument which must be called with the response.

function installAuthHandler(proxy) {
  removeAuthHandler();
  authListener = (details, asyncCallback) => {
    if (
      details.isProxy &&
      activeProxy &&
      activeProxy.username &&
      activeProxy.password
    ) {
      asyncCallback({
        authCredentials: {
          username: activeProxy.username,
          password: activeProxy.password,
        },
      });
    } else {
      asyncCallback({ cancel: false });
    }
  };
  chrome.webRequest.onAuthRequired.addListener(
    authListener,
    { urls: ["<all_urls>"] },
    ["asyncBlocking"],
  );
}

function removeAuthHandler() {
  if (authListener) {
    try {
      chrome.webRequest.onAuthRequired.removeListener(authListener);
    } catch (e) {}
    authListener = null;
  }
}

// ─── Traffic Stats via webRequest ────────────────────────────────────

let trafficStats = { upload: 0, download: 0 };

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!activeProxy) return;
    const size = details.requestBody
      ? (details.requestBody.raw || []).reduce(
          (s, b) => s + (b.bytes ? b.bytes.byteLength : 0),
          0,
        )
      : 0;
    trafficStats.upload += size + 200;
    debounceSaveStats();
  },
  { urls: ["<all_urls>"] },
  ["requestBody"],
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!activeProxy) return;
    let size = 0;
    if (details.responseHeaders) {
      for (const h of details.responseHeaders) {
        if (h.name.toLowerCase() === "content-length" && h.value) {
          size += parseInt(h.value, 10) || 0;
        }
      }
    }
    size += 200;
    trafficStats.download += size;
    debounceSaveStats();
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);

let saveTimer = null;
function debounceSaveStats() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    chrome.storage.local.set({
      uploadBytes: trafficStats.upload,
      downloadBytes: trafficStats.download,
    });
  }, 500);
}

// ─── Message Handler ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "connect") {
    activeProxy = msg.proxy;
    trafficStats = { upload: 0, download: 0 };

    const config = buildProxyConfig(msg.proxy);

    if (activeProxy.username && activeProxy.password) {
      installAuthHandler(activeProxy);
    }

    chrome.proxy.settings.set({ scope: "regular", value: config }, () => {
      fetchIP()
        .then((ip) => {
          sendResponse({ ip });
        })
        .catch(() => {
          sendResponse({ ip: msg.proxy.host });
        });
    });

    return true;
  }

  if (msg.type === "disconnect") {
    activeProxy = null;
    removeAuthHandler();
    chrome.proxy.settings.clear({ scope: "regular" });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "updateSiteRules") {
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "getTrafficStats") {
    sendResponse({
      upload: trafficStats.upload,
      download: trafficStats.download,
    });
    return false;
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────

function buildProxyConfig(proxy) {
  const scheme = proxy.protocol === "socks5" ? "socks5" : "http";
  return {
    mode: "fixed_servers",
    rules: {
      singleProxy: { scheme, host: proxy.host, port: proxy.port },
      bypassList: ["localhost", "127.0.0.1"],
    },
  };
}

async function fetchIP() {
  const res = await fetch("https://api.ipify.org?format=json");
  const data = await res.json();
  return data.ip;
}

chrome.proxy.onProxyError.addListener((details) => {
  console.error("ProxyFoxy proxy error:", details);
});
