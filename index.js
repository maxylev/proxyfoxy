#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const net = require("net");
const crypto = require("crypto");
const os = require("os");

// -----------------------------------------------------------------
// 🛠️ CLI PARSING & CONFIG
// -----------------------------------------------------------------
const rawArgs = process.argv.slice(2);
const command = rawArgs[0];
const args = [];
const flags = { country: null, limit: null, gateway: 9000 };

for (let i = 1; i < rawArgs.length; i++) {
  if (rawArgs[i].startsWith("--country="))
    flags.country = rawArgs[i].split("=")[1].toUpperCase();
  else if (rawArgs[i].startsWith("--limit="))
    flags.limit = parseBytes(rawArgs[i].split("=")[1]);
  else if (rawArgs[i].startsWith("--gateway="))
    flags.gateway = parseInt(rawArgs[i].split("=")[1]);
  else args.push(rawArgs[i]);
}

const run = (cmd, showOutput = true) =>
  execSync(cmd, { stdio: showOutput ? "inherit" : "ignore" });
const runQuiet = (cmd) => {
  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
};

function printHelp() {
  console.log(`
🦊 ProxyFoxy - Distributed Proxy Manager

Usage:
  npx proxyfoxy add <user> <pass> <port>[protocol] [--country=US] [--limit=2GB]
  npx proxyfoxy change <user> <newpass>     # Change password for HTTP/SOCKS5
  npx proxyfoxy delete <user> <port>        # Delete a specific proxy
  npx proxyfoxy list                        # Show active proxies (copy/paste format)
  npx proxyfoxy status                      # Detailed analytics (Countries, IPs, Traffic)
  npx proxyfoxy stop [port|protocol]        # Stop specific or all proxy services
  npx proxyfoxy start [port|protocol]       # Start specific or all proxy services
  npx proxyfoxy uninstall                   # Completely remove everything

Protocols Available:
  - http        (Default, standard web proxy)
  - socks5      (Low-level TCP via Dante, great for torrents)
  - mtproto     (Telegram proxy via MTG)
  - residential (Routes traffic through distributed Home PCs)

Residential Network:
  npx proxyfoxy provider <vps-ip>:<gateway-port>   # Run on Exit Node (Home PC)
  npx proxyfoxy provider <vps-ip>:<gateway-port> --quiet  # Suppress reconnect messages

Provider Management (run on VPS):
  npx proxyfoxy providers                           # List connected / blacklisted providers
  npx proxyfoxy providers block <ip> [reason]       # Blacklist a provider IP
  npx proxyfoxy providers unblock <ip>              # Remove IP from blacklist
  npx proxyfoxy providers whitelist <ip>            # Add IP to whitelist (only these IPs allowed)
  npx proxyfoxy providers unwhitelist <ip>          # Remove IP from whitelist

Docker:
  docker run -d -p <port>:<port> ghcr.io/maxylev/proxyfoxy:latest <user> <pass> <port> [protocol]
  `);
}

const requiresRoot = [
  "add",
  "delete",
  "change",
  "stop",
  "start",
  "uninstall",
  "serve-master",
];
if (
  requiresRoot.includes(command) &&
  process.getuid &&
  process.getuid() !== 0
) {
  console.error(
    "\n❌ Error: Please run ProxyFoxy with sudo/root privileges.\n",
  );
  process.exit(1);
}

const DB_PATH = "/etc/proxyfoxy.json";
const STATE_PATH = "/var/run/proxyfoxy_state.json";
const BLACKLIST_PATH = "/etc/proxyfoxy_blacklist.json";
const WHITELIST_PATH = "/etc/proxyfoxy_whitelist.json";

let db = { proxies: [] };
try {
  if (fs.existsSync(DB_PATH)) db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
} catch (e) {}

const saveDb = () => {
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2));
  fs.renameSync(tmpPath, DB_PATH);
};

function loadBlacklist() {
  try {
    if (fs.existsSync(BLACKLIST_PATH))
      return JSON.parse(fs.readFileSync(BLACKLIST_PATH, "utf8"));
  } catch (e) {}
  return {};
}

function saveBlacklist(list) {
  try {
    const tmp = `${BLACKLIST_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, BLACKLIST_PATH);
  } catch (e) {}
}

function loadWhitelist() {
  try {
    if (fs.existsSync(WHITELIST_PATH))
      return JSON.parse(fs.readFileSync(WHITELIST_PATH, "utf8"));
  } catch (e) {}
  return [];
}

function saveWhitelist(list) {
  try {
    const tmp = `${WHITELIST_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, WHITELIST_PATH);
  } catch (e) {}
}

// -----------------------------------------------------------------
// 🌐 UTILITIES & IP TRACKING
// -----------------------------------------------------------------
function parseBytes(str) {
  const match = str.match(/^(\d+(?:\.\d+)?)([KMG]B?)$/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit.startsWith("K")) return val * 1024;
  if (unit.startsWith("M")) return val * 1024 * 1024;
  if (unit.startsWith("G")) return val * 1024 * 1024 * 1024;
  return val;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024,
    dm = 2,
    sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function validateUser(user) {
  if (!/^[a-zA-Z0-9_-]+$/.test(user)) {
    console.error(
      "\n❌ Invalid username. Only letters, numbers, underscores, and hyphens are allowed.\n",
    );
    process.exit(1);
  }
}

function validatePort(port) {
  const p = parseInt(port, 10);
  if (isNaN(p) || p < 1 || p > 65535) {
    console.error("\n❌ Invalid port. Must be a number between 1 and 65535.\n");
    process.exit(1);
  }
}

function shellEscape(str) {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

async function getPublicIp() {
  const providers = [
    "https://icanhazip.com",
    "https://ifconfig.me",
    "https://ipinfo.io/ip",
  ];
  for (const url of providers) {
    try {
      const ip = await new Promise((res, rej) => {
        const req = https.get(url, { timeout: 2500 }, (r) => {
          let d = "";
          r.on("data", (c) => (d += c));
          r.on("end", () => res(d.trim()));
        });
        req.on("error", rej);
        req.on("timeout", () => {
          req.destroy();
          rej("timeout");
        });
      });
      if (/^[\d\.]+$/.test(ip)) return ip;
    } catch (e) {
      continue;
    }
  }
  return "YOUR_SERVER_IP";
}

const ipTokens = [
  "223469161b4d4b",
  "11d71a12a4c8ac",
  "cf2feb5555f627",
  "cf4c724a75a7ee",
  "4adfcc46c95c4a",
  "416c3b42e5cc10",
];
function getIpInfo(ip) {
  const token = ipTokens[Math.floor(Math.random() * ipTokens.length)];
  return new Promise((resolve) => {
    https
      .get(
        `https://api.ipinfo.io/lite/${ip}?token=${token}`,
        { timeout: 3000 },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve({});
            }
          });
        },
      )
      .on("error", () => resolve({}));
  });
}

// -----------------------------------------------------------------
// 🐧 OS ABSTRACTION & KERNEL FIREWALL
// -----------------------------------------------------------------
function detectOS() {
  if (process.platform !== "linux" || !fs.existsSync("/etc/os-release"))
    return null;
  const osRelease = fs.readFileSync("/etc/os-release", "utf8").toLowerCase();

  const isAlpine = osRelease.includes("alpine");
  const isDebian = osRelease.includes("debian") || osRelease.includes("ubuntu");
  const isRhel =
    osRelease.includes("centos") ||
    osRelease.includes("rhel") ||
    osRelease.includes("rocky") ||
    osRelease.includes("almalinux");

  return {
    isAlpine,
    isDebian,
    isRhel,
    install: (pkgs) => {
      if (isAlpine) run(`apk update && apk add --no-cache iptables ${pkgs}`);
      else if (isDebian)
        run(
          `apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y iptables ${pkgs}`,
        );
      else
        run(
          `dnf install -y epel-release iptables 2>/dev/null || yum install -y epel-release iptables 2>/dev/null || true; dnf install -y ${pkgs} || yum install -y ${pkgs}`,
        );
    },
    service: (action, name) => {
      if (
        fs.existsSync("/etc/systemd/system") ||
        runQuiet("command -v systemctl")
      ) {
        runQuiet(`systemctl ${action} ${name} 2>/dev/null || true`);
      } else if (isAlpine || fs.existsSync("/sbin/openrc-run")) {
        runQuiet(`rc-service ${name} ${action} 2>/dev/null || true`);
      }
    },
    isServiceRunning: (name) => {
      if (
        fs.existsSync("/etc/systemd/system") ||
        runQuiet("command -v systemctl")
      ) {
        return runQuiet(`systemctl is-active --quiet ${name}`);
      } else {
        return runQuiet(`rc-service ${name} status | grep -q 'started'`);
      }
    },
    daemonize: (name, execCmd) => {
      if (
        fs.existsSync("/etc/systemd/system") ||
        runQuiet("command -v systemctl")
      ) {
        const svc = `[Unit]\nDescription=ProxyFoxy ${name}\nAfter=network.target\n[Service]\nExecStart=${execCmd}\nRestart=always\nLimitNOFILE=65535\n[Install]\nWantedBy=multi-user.target`;
        fs.writeFileSync(`/etc/systemd/system/${name}.service`, svc);
        runQuiet(
          `systemctl daemon-reload && systemctl enable ${name} && systemctl restart ${name}`,
        );
      } else if (fs.existsSync("/etc/init.d")) {
        const svcPath = `/etc/init.d/${name}`;
        const svc = `#!/sbin/openrc-run\nname="${name}"\ncommand="${execCmd.split(" ")[0]}"\ncommand_args="${execCmd.substring(execCmd.indexOf(" ") + 1)}"\ncommand_background="yes"\npidfile="/run/${name}.pid"\n`;
        fs.writeFileSync(svcPath, svc);
        runQuiet(
          `chmod +x ${svcPath} && rc-update add ${name} default && rc-service ${name} restart`,
        );
      }
    },
  };
}

function configureFirewall(port, osInfo, remove = false) {
  try {
    if (!remove) {
      if (osInfo.isDebian) runQuiet(`ufw allow ${port}/tcp`);
      if (osInfo.isRhel)
        runQuiet(
          `firewall-cmd --permanent --add-port=${port}/tcp && firewall-cmd --reload`,
        );
      if (
        !runQuiet(
          `iptables -C INPUT -p tcp --dport ${port} -j ACCEPT 2>/dev/null`,
        )
      )
        runQuiet(`iptables -I INPUT 1 -p tcp --dport ${port} -j ACCEPT`);
      if (
        !runQuiet(
          `iptables -C OUTPUT -p tcp --sport ${port} -j ACCEPT 2>/dev/null`,
        )
      )
        runQuiet(`iptables -I OUTPUT 1 -p tcp --sport ${port} -j ACCEPT`);
    } else {
      if (osInfo.isDebian) runQuiet(`ufw delete allow ${port}/tcp`);
      if (osInfo.isRhel)
        runQuiet(
          `firewall-cmd --permanent --remove-port=${port}/tcp && firewall-cmd --reload`,
        );
      runQuiet(`iptables -D INPUT -p tcp --dport ${port} -j ACCEPT`);
      runQuiet(`iptables -D OUTPUT -p tcp --sport ${port} -j ACCEPT`);
    }
  } catch (e) {}
}

const portTraffic = new Map();

function trackPortRx(port, bytes) {
  if (!portTraffic.has(port)) portTraffic.set(port, { rx: 0, tx: 0 });
  portTraffic.get(port).rx += bytes;
}

function trackPortTx(port, bytes) {
  if (!portTraffic.has(port)) portTraffic.set(port, { rx: 0, tx: 0 });
  portTraffic.get(port).tx += bytes;
}

function getPortTraffic(port) {
  return portTraffic.get(port) || { rx: 0, tx: 0 };
}

function trackTraffic(port) {
  let rx = 0, tx = 0;
  try {
    const i = execSync(
      `iptables -nxvL INPUT | grep -w "dpt:${port}" | head -n 1 || true`,
      { stdio: "pipe" },
    ).toString().trim();
    if (i) rx = parseInt(i.split(/\s+/)[1]) || 0;
    const o = execSync(
      `iptables -nxvL OUTPUT | grep -w "spt:${port}" | head -n 1 || true`,
      { stdio: "pipe" },
    ).toString().trim();
    if (o) tx = parseInt(o.split(/\s+/)[1]) || 0;
  } catch (e) {}
  const appData = getPortTraffic(port);
  let fileData = { rx: 0, tx: 0 };
  try {
    const TRAFFIC_PATH = "/var/lib/proxyfoxy/traffic.json";
    if (fs.existsSync(TRAFFIC_PATH)) {
      const all = JSON.parse(fs.readFileSync(TRAFFIC_PATH, "utf8"));
      if (all[port]) fileData = all[port];
    }
  } catch (e) {}
  rx = Math.max(rx, appData.rx, fileData.rx);
  tx = Math.max(tx, appData.tx, fileData.tx);
  return { rx, tx };
}

// -----------------------------------------------------------------
// 🏠 RESIDENTIAL RELAY NETWORK (Daemon)
// -----------------------------------------------------------------
function serveResidentialMaster(gatewayPort) {
  gatewayPort = gatewayPort || 9000;
  console.log(`🚀 Starting Master Residential Daemon on port ${gatewayPort}...`);
  let providers = [];
  const consumerServers = new Map();
  const providerErrors = new Map();
  const TRAFFIC_PATH = "/var/lib/proxyfoxy/traffic.json";

  function loadTrafficFromFile() {
    try {
      if (fs.existsSync(TRAFFIC_PATH)) {
        const data = JSON.parse(fs.readFileSync(TRAFFIC_PATH, "utf8"));
        for (const [k, v] of Object.entries(data)) {
          portTraffic.set(parseInt(k), v);
        }
      }
    } catch (e) {}
  }

  function syncTrafficToFile() {
    try {
      const dir = "/var/lib/proxyfoxy";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {};
      portTraffic.forEach((v, k) => { data[k] = v; });
      const tmp = `${TRAFFIC_PATH}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, TRAFFIC_PATH);
    } catch (e) {}
  }

  const AUTO_BLACKLIST_THRESHOLD = 5;
  const AUTO_BLACKLIST_WINDOW = 600000;

  function isIpAllowed(ip) {
    const blacklist = loadBlacklist();
    if (blacklist[ip]) return false;
    const whitelist = loadWhitelist();
    if (whitelist.length > 0 && !whitelist.includes(ip)) return false;
    return true;
  }

  function recordError(ip) {
    const now = Date.now();
    let record = providerErrors.get(ip);
    if (!record || now - record.firstAt > AUTO_BLACKLIST_WINDOW) {
      record = { count: 0, firstAt: now };
      providerErrors.set(ip, record);
    }
    record.count++;
    if (record.count >= AUTO_BLACKLIST_THRESHOLD) {
      const blacklist = loadBlacklist();
      if (!blacklist[ip]) {
        blacklist[ip] = { reason: "auto", at: new Date().toISOString() };
        saveBlacklist(blacklist);
        providers.filter((p) => p.ipRaw === ip).forEach((p) => p.destroy());
        console.log(
          `⚠️  Auto-blacklisted provider ${ip} (${record.count} abrupt disconnects)`,
        );
      }
    }
  }

  function syncStateToFile() {
    const state = providers.map((p) => ({
      id: p.providerId,
      ip: p.ipRaw,
      country: p.country,
      rx: p.rxBytes,
      tx: p.txBytes,
      connectedAt: p.connectedAt,
    }));
    try {
      fs.writeFileSync(`${STATE_PATH}.tmp`, JSON.stringify(state));
      fs.renameSync(`${STATE_PATH}.tmp`, STATE_PATH);
    } catch (e) {}
  }

  function syncServers() {
    try {
      const currentDb = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
      const resProxies = currentDb.proxies.filter(
        (p) => p.type === "residential",
      );

      consumerServers.forEach((server, port) => {
        const conf = resProxies.find((p) => p.port == port);
        const traffic = trackTraffic(port);
        if (!conf || (conf.limit && traffic.rx + traffic.tx >= conf.limit)) {
          server.close();
          consumerServers.delete(port);
        }
      });

      resProxies.forEach((proxy) => {
        if (!consumerServers.has(proxy.port)) {
          const traffic = trackTraffic(proxy.port);
          if (proxy.limit && traffic.rx + traffic.tx >= proxy.limit) return;
          const server = net.createServer((socket) =>
            handleConsumer(socket, proxy),
          );
          server.on("error", () => {});
          server.listen(proxy.port, "0.0.0.0");
          consumerServers.set(proxy.port, server);
        }
      });
    } catch (e) {}
    syncTrafficToFile();
    syncStateToFile();
  }

  loadTrafficFromFile();

  setInterval(syncServers, 10000);
  syncServers();

  setInterval(() => {
    const blacklist = loadBlacklist();
    if (Object.keys(blacklist).length > 0) {
      providers.forEach((p) => {
        if (blacklist[p.ipRaw]) p.destroy();
      });
    }
  }, 1000);

  const gateway = net.createServer((socket) => {
    socket.rxBytes = 0;
    socket.txBytes = 0;

    // Override write to track outward traffic efficiently
    const originalWrite = socket.write;
    socket.write = function (chunk, ...args) {
      if (chunk) socket.txBytes += chunk.length;
      return originalWrite.apply(this, [chunk, ...args]);
    };

    socket.once("data", async (data) => {
      socket.rxBytes += data.length;
      const authHeader = data.toString("utf8", 0, 100).split("\n")[0];
      if (!authHeader.startsWith("PROVIDER")) return socket.destroy();

      socket.ipRaw = socket.remoteAddress.replace(/^.*:/, "");
      if (!isIpAllowed(socket.ipRaw)) return socket.destroy();

      const ipInfo = await getIpInfo(socket.ipRaw);
      socket.country = ipInfo.country_code || "UNKNOWN";
      socket.providerId = crypto.randomBytes(4).toString("hex");
      socket.connectedAt = new Date().toISOString();
      socket.targets = new Map();
      socket.graceful = false;

      providers.push(socket);
      syncStateToFile();

      let buffer = "";
      socket.on("data", (chunk) => {
        socket.rxBytes += chunk.length;
        buffer += chunk.toString("utf8");
        let lines = buffer.split("\n");
        buffer = lines.pop();
        for (let line of lines) {
          if (!line) continue;
          if (line === "GRACEFUL_DISCONNECT") {
            socket.graceful = true;
            socket.destroy();
            return;
          }
          try {
            const msg = JSON.parse(line);
            const target = socket.targets.get(msg.id);
            if (!target) continue;
            if (msg.type === "data")
              target.write(Buffer.from(msg.data, "base64"));
            else if (msg.type === "close") {
              target.destroy();
              socket.targets.delete(msg.id);
            }
          } catch (e) {}
        }
      });

      const cleanup = () => {
        providers = providers.filter((p) => p !== socket);
        socket.targets.forEach((t) => t.destroy());
        socket.targets.clear();
        syncStateToFile();
        if (!socket.graceful && socket.ipRaw) recordError(socket.ipRaw);
      };

      socket.on("error", cleanup);
      socket.on("close", cleanup);
    });
  });

  gateway.on("error", () => {});
  gateway.listen(gatewayPort, "0.0.0.0");

  function relayToProvider(socket, provider, proxyConf, host, port) {
    const id = crypto.randomBytes(4).toString("hex");
    provider.targets.set(id, socket);

    try {
      provider.write(
        JSON.stringify({ type: "connect", id, host, port }) + "\n",
      );
    } catch (e) {
      return socket.destroy();
    }

    socket.on("data", (chunk) => {
      try {
        provider.write(
          JSON.stringify({
            type: "data",
            id,
            data: chunk.toString("base64"),
          }) + "\n",
        );
      } catch (e) {
        socket.destroy();
      }
    });

    const closeDown = () => {
      try {
        provider.write(JSON.stringify({ type: "close", id }) + "\n");
      } catch (e) {}
      provider.targets.delete(id);
      socket.destroy();
    };

    socket.on("error", closeDown);
    socket.on("close", closeDown);
  }

  function pickProvider(proxyConf) {
    let validProviders = proxyConf.country
      ? providers.filter((p) => p.country === proxyConf.country)
      : providers;
    if (validProviders.length === 0) return null;
    return validProviders[Math.floor(Math.random() * validProviders.length)];
  }

  function handleConsumer(socket, proxyConf) {
    const consumerPort = proxyConf.port;

    socket.on("data", (chunk) => {
      trackPortRx(consumerPort, chunk.length);
    });

    const origWrite = socket.write.bind(socket);
    socket.write = function (data, ...args) {
      if (data) {
        const len = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
        trackPortTx(consumerPort, len);
      }
      return origWrite(data, ...args);
    };

    socket.once("data", (firstChunk) => {
      if (firstChunk[0] === 0x05) {
        handleSOCKS5(socket, proxyConf, firstChunk);
      } else {
        handleHTTPConnect(socket, proxyConf, firstChunk);
      }
    });
    socket.on("error", () => socket.destroy());
  }

  function handleSOCKS5(socket, proxyConf, greeting) {
    if (greeting.length < 3) return socket.destroy();

    const nMethods = greeting[1];
    const methods = new Set();
    for (let i = 0; i < nMethods && 2 + i < greeting.length; i++)
      methods.add(greeting[2 + i]);

    if (!methods.has(0x02)) {
      socket.write(Buffer.from([0x05, 0xff]));
      return socket.destroy();
    }

    socket.write(Buffer.from([0x05, 0x02]));

    socket.once("data", (authData) => {
      if (authData[0] !== 0x01 || authData.length < 4) {
        socket.write(Buffer.from([0x01, 0x01]));
        return socket.destroy();
      }

      const ulen = authData[1];
      const uname = authData.slice(2, 2 + ulen).toString();
      const plen = authData[2 + ulen];
      const passwd = authData.slice(3 + ulen, 3 + ulen + plen).toString();

      if (uname !== proxyConf.user || passwd !== proxyConf.pass) {
        socket.write(Buffer.from([0x01, 0x01]));
        return socket.destroy();
      }

      socket.write(Buffer.from([0x01, 0x00]));

      const provider = pickProvider(proxyConf);
      if (!provider) return socket.destroy();

      socket.once("data", (connData) => {
        if (connData[0] !== 0x05 || connData[1] !== 0x01)
          return socket.destroy();

        let host = "",
          offset = 4;
        if (connData[3] === 0x01) {
          host = connData.slice(4, 8).join(".");
          offset = 8;
        } else if (connData[3] === 0x03) {
          const len = connData[4];
          host = connData.slice(5, 5 + len).toString();
          offset = 5 + len;
        } else return socket.destroy();

        const targetPort = connData.readUInt16BE(offset);
        socket.write(
          Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]),
        );
        relayToProvider(socket, provider, proxyConf, host, targetPort);
      });
    });
  }

  function handleHTTPConnect(socket, proxyConf, firstChunk) {
    const header = firstChunk.toString("utf8");
    const match = header.match(
      /^CONNECT\s+([^\s:]+):(\d+)\s+HTTP\/1\.[01]\r?\n/i,
    );
    if (!match) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      return socket.destroy();
    }

    const [, host, port] = match;

    let authHeader = "";
    const lines = header.split(/\r?\n/);
    for (const line of lines) {
      if (line.toLowerCase().startsWith("proxy-authorization:")) {
        authHeader = line.substring(line.indexOf(":") + 1).trim();
        break;
      }
    }

    if (!authHeader.startsWith("Basic ")) {
      socket.write(
        "HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"proxyfoxy\"\r\n\r\n",
      );
      return socket.destroy();
    }

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) {
      socket.write(
        "HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"proxyfoxy\"\r\n\r\n",
      );
      return socket.destroy();
    }

    const uname = decoded.substring(0, colonIdx);
    const passwd = decoded.substring(colonIdx + 1);

    if (uname !== proxyConf.user || passwd !== proxyConf.pass) {
      socket.write(
        "HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"proxyfoxy\"\r\n\r\n",
      );
      return socket.destroy();
    }

    const provider = pickProvider(proxyConf);
    if (!provider) {
      socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      return socket.destroy();
    }

    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    relayToProvider(socket, provider, proxyConf, host, parseInt(port));
  }
}

// -----------------------------------------------------------------
// 🔌 PROVIDER CLIENT (Home PC Exit Node)
// -----------------------------------------------------------------
function runProviderClient(host, port, quiet) {
  let targets = new Map();
  let activeSocket = null;

  function log(msg) {
    if (!quiet) console.log(msg);
  }

  function gracefulShutdown() {
    if (activeSocket && !activeSocket.destroyed) {
      try {
        activeSocket.write("GRACEFUL_DISCONNECT\n");
      } catch (e) {}
    }
    setTimeout(() => process.exit(0), 500);
  }

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);

  function connect() {
    log(`\n⏳ Connecting to Master Gateway at ${host}:${port}...`);
    const ws = net.createConnection({ host, port }, () => {
      console.log("✅ Connected! Proxying traffic globally...");
      ws.write("PROVIDER\n");
    });
    activeSocket = ws;

    let buffer = "";
    ws.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let lines = buffer.split("\n");
      buffer = lines.pop();
      for (let line of lines) {
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "connect") {
            const target = net.createConnection({
              host: msg.host,
              port: msg.port,
            });
            target.on("data", (data) => {
              try {
                ws.write(
                  JSON.stringify({
                    type: "data",
                    id: msg.id,
                    data: data.toString("base64"),
                  }) + "\n",
                );
              } catch (e) {}
            });
            const closeTarget = () => {
              try {
                ws.write(JSON.stringify({ type: "close", id: msg.id }) + "\n");
              } catch (e) {}
              targets.delete(msg.id);
            };
            target.on("error", closeTarget);
            target.on("close", closeTarget);
            targets.set(msg.id, target);
          } else if (msg.type === "data" && targets.has(msg.id)) {
            targets.get(msg.id).write(Buffer.from(msg.data, "base64"));
          } else if (msg.type === "close" && targets.has(msg.id)) {
            targets.get(msg.id).destroy();
            targets.delete(msg.id);
          }
        } catch (e) {}
      }
    });

    ws.on("close", () => {
      log("❌ Disconnected. Reconnecting in 3s...");
      targets.forEach((t) => t.destroy());
      targets.clear();
      setTimeout(connect, 3000);
    });
    ws.on("error", () => {});
  }
  connect();
}

// -----------------------------------------------------------------
// 🚀 MAIN CLI ROUTER
// -----------------------------------------------------------------
(async () => {
  const osInfo = detectOS();

  try {
    switch (command) {
      case "serve-master":
        serveResidentialMaster(parseInt(args[0]) || 9000);
        break;

      case "provider": {
        const pQuiet = args.includes("--quiet");
        const pArgs = args.filter((a) => a !== "--quiet");
        let pIp, pPort;
        if (pArgs.length === 1 && pArgs[0].includes(":")) {
          [pIp, pPort] = pArgs[0].split(":");
        } else if (pArgs.length === 2) {
          [pIp, pPort] = pArgs;
        } else {
          return console.log(
            "\n❌ Usage: proxyfoxy provider <ip>:<port> [--quiet]\n",
          );
        }
        runProviderClient(pIp, pPort, pQuiet);
        break;
      }

      case "providers": {
        const sub = args[0];
        if (sub === "block") {
          const ip = args[1];
          if (!ip)
            return console.log("\n❌ Usage: proxyfoxy providers block <ip>\n");
          const list = loadBlacklist();
          list[ip] = {
            reason: args.slice(2).join(" ") || "manual",
            at: new Date().toISOString(),
          };
          saveBlacklist(list);
          console.log(`\n✅ Blocked provider ${ip}.\n`);
        } else if (sub === "unblock") {
          const ip = args[1];
          if (!ip)
            return console.log(
              "\n❌ Usage: proxyfoxy providers unblock <ip>\n",
            );
          const list = loadBlacklist();
          delete list[ip];
          saveBlacklist(list);
          console.log(`\n✅ Unblocked provider ${ip}.\n`);
        } else if (sub === "whitelist") {
          const ip = args[1];
          if (!ip)
            return console.log(
              "\n❌ Usage: proxyfoxy providers whitelist <ip>\n",
            );
          const list = loadWhitelist();
          if (!list.includes(ip)) list.push(ip);
          saveWhitelist(list);
          console.log(`\n✅ Added ${ip} to whitelist.\n`);
        } else if (sub === "unwhitelist") {
          const ip = args[1];
          if (!ip)
            return console.log(
              "\n❌ Usage: proxyfoxy providers unwhitelist <ip>\n",
            );
          const list = loadWhitelist().filter((i) => i !== ip);
          saveWhitelist(list);
          console.log(`\n✅ Removed ${ip} from whitelist.\n`);
        } else {
          let resState = [];
          try {
            resState = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
          } catch (e) {}
          const blacklist = loadBlacklist();
          const whitelist = loadWhitelist();

          console.log(`\n🏠 PROVIDER MANAGEMENT`);
          console.log(`════════════════════════════════════════════`);

          if (resState.length > 0) {
            console.log(`\n🟢 Connected (${resState.length}):`);
            resState.forEach((p) =>
              console.log(
                `   ├─ ${p.ip} [${p.country}] since ${p.connectedAt}`,
              ),
            );
          } else {
            console.log(`\n🔴 No providers connected.`);
          }

          const blEntries = Object.entries(blacklist);
          if (blEntries.length > 0) {
            console.log(`\n🚫 Blacklisted (${blEntries.length}):`);
            blEntries.forEach(([ip, info]) =>
              console.log(`   ├─ ${ip} — ${info.reason} (${info.at})`),
            );
          }

          if (whitelist.length > 0) {
            console.log(`\n✅ Whitelist (${whitelist.length}):`);
            whitelist.forEach((ip) => console.log(`   ├─ ${ip}`));
          }

          console.log(
            `\n══════════════════════════════════════════════════════════\n`,
          );
        }
        break;
      }

      case "add": {
        if (!osInfo)
          return console.error(
            "\n❌ Unsupported OS. Requires Debian/Ubuntu, RHEL/CentOS, or Alpine.\n",
          );
        let [user, pass, port, requestedProto] = args;
        if (!user || !pass || !port)
          return console.log(
            "\n❌ Usage: proxyfoxy add <user> <pass> <port> [protocol]\n",
          );

        validateUser(user);
        validatePort(port);

        const protocol = (requestedProto || "http").toLowerCase();
        console.log(
          `\n🚀 Deploying ${protocol.toUpperCase()} Proxy -> Port: ${port}...\n`,
        );

        if (protocol === "http") {
          osInfo.install(
            osInfo.isDebian
              ? "squid apache2-utils ufw"
              : osInfo.isAlpine
                ? "squid apache2-utils"
                : "squid httpd-tools firewalld",
          );
          run(`mkdir -p /etc/squid && touch /etc/squid/passwords`);
          run(
            `htpasswd -b /etc/squid/passwords ${shellEscape(user)} ${shellEscape(pass)}`,
          );

          const setupAuth = `AUTH_PATH=$(find /usr/lib/squid /usr/lib64/squid /usr/libexec/squid -name basic_ncsa_auth 2>/dev/null | head -n 1)\ncat <<EOF > /etc/squid/squid.conf\nauth_param basic program $AUTH_PATH /etc/squid/passwords\nacl authenticated proxy_auth REQUIRED\nhttp_access allow authenticated\nhttp_access deny all\nEOF`;
          run(
            `grep -q "auth_param basic" /etc/squid/squid.conf 2>/dev/null || bash -c '${setupAuth}'`,
          );
          run(
            `grep -q "^http_port ${port}$" /etc/squid/squid.conf 2>/dev/null || echo "http_port ${port}" | tee -a /etc/squid/squid.conf`,
          );

          if (osInfo.isServiceRunning("squid")) {
            if (osInfo.isDebian || osInfo.isRhel)
              runQuiet("systemctl reload squid");
            else runQuiet("squid -k reconfigure");
          } else {
            osInfo.service("restart", "squid");
          }
        } else if (protocol === "socks5") {
          osInfo.install(
            osInfo.isDebian ? "dante-server ufw" : "dante-server firewalld",
          );

          if (osInfo.isAlpine)
            run(`adduser -H -D ${shellEscape(user)} 2>/dev/null || true`);
          else
            run(
              `useradd -M -s /usr/sbin/nologin ${shellEscape(user)} 2>/dev/null || true`,
            );
          run(`echo ${shellEscape(user)}:${shellEscape(pass)} | chpasswd`);

          let extIf = "eth0";
          try {
            const ifaces = os.networkInterfaces();
            extIf =
              Object.keys(ifaces).find(
                (k) =>
                  k !== "lo" && !k.startsWith("docker") && !k.startsWith("br-"),
              ) || "eth0";
          } catch (e) {}

          const confPath = osInfo.isDebian
            ? "/etc/danted.conf"
            : "/etc/sockd.conf";
          const svcName = osInfo.isDebian ? "danted" : "sockd";

          fs.writeFileSync(
            confPath,
            `logoutput: syslog\ninternal: 0.0.0.0 port = ${port}\nexternal: ${extIf}\nsocksmethod: username\nclientmethod: none\nuser.privileged: root\nuser.unprivileged: nobody\nclient pass { from: 0.0.0.0/0 to: 0.0.0.0/0 }\nsocks pass { from: 0.0.0.0/0 to: 0.0.0.0/0 }\n`,
          );
          osInfo.service("restart", svcName);
        } else if (protocol === "mtproto") {
          let mtgSecret = pass;
          if (mtgSecret.length < 32) {
            const arch = os.arch() === "arm64" ? "arm64" : "amd64";
            run(
              `wget -qO- https://github.com/9seconds/mtg/releases/download/v2.2.8/mtg-2.2.8-linux-${arch}.tar.gz | tar -xz -C /tmp`,
            );
            run(
              `mv /tmp/mtg-*/mtg /usr/local/bin/mtg && chmod +x /usr/local/bin/mtg`,
            );
            mtgSecret = execSync("/usr/local/bin/mtg generate-secret tls")
              .toString()
              .trim();
            pass = mtgSecret;
          }
          osInfo.daemonize(
            `proxyfoxy-mtproto-${port}`,
            `/usr/local/bin/mtg run -b 0.0.0.0:${port} ${mtgSecret}`,
          );
        } else if (protocol === "residential") {
          const execPath = process.argv[0],
            scriptPath = fs.realpathSync(process.argv[1]);
          osInfo.daemonize(
            `proxyfoxy-residential-master`,
            `${execPath} ${scriptPath} serve-master ${flags.gateway}`,
          );
          configureFirewall(flags.gateway, osInfo);
        }

        configureFirewall(port, osInfo);
        db.proxies = db.proxies.filter((p) => p.port != port);
        db.proxies.push({
          type: protocol,
          user,
          pass,
          port,
          country: flags.country,
          limit: flags.limit,
          gatewayPort: protocol === "residential" ? flags.gateway : undefined,
        });
        saveDb();

        const ip = await getPublicIp();
        console.log(`\n✅ SUCCESS! Proxy is live.\n`);
        if (protocol === "mtproto")
          console.log(
            `   🌐 TG Link: \x1b[32mtg://proxy?server=${ip}&port=${port}&secret=${pass}\x1b[0m\n`,
          );
        else if (protocol === "residential") {
          console.log(
            `   🌐 Proxy: \x1b[32m${user}:${pass}@${ip}:${port}\x1b[0m`,
          );
          console.log(
            `   🏠 Home PC string: \x1b[36mnpx proxyfoxy provider ${ip}:${flags.gateway}\x1b[0m\n`,
          );
        } else {
          console.log(
            `   🌐 Ready to use: \x1b[32m${user}:${pass}@${ip}:${port}\x1b[0m\n`,
          );
        }
        break;
      }

      case "change": {
        const [user, newpass] = args;
        if (!user || !newpass)
          return console.log("\n❌ Usage: proxyfoxy change <user> <newpass>\n");

        validateUser(user);

        let updated = false;
        const updatedTypes = new Set();
        db.proxies.forEach((p) => {
          if (
            p.user === user &&
            (p.type === "http" ||
              p.type === "socks5" ||
              p.type === "residential")
          ) {
            p.pass = newpass;
            updated = true;
            updatedTypes.add(p.type);
            if (p.type === "http")
              runQuiet(
                `htpasswd -b /etc/squid/passwords ${shellEscape(user)} ${shellEscape(newpass)}`,
              );
            if (p.type === "socks5")
              runQuiet(
                `echo ${shellEscape(user)}:${shellEscape(newpass)} | chpasswd`,
              );
          }
        });

        if (updated) {
          saveDb();
          if (updatedTypes.has("http")) {
            if (osInfo.isServiceRunning("squid"))
              runQuiet(
                osInfo.isAlpine
                  ? "squid -k reconfigure"
                  : "systemctl reload squid",
              );
            else osInfo.service("restart", "squid");
          }
          if (updatedTypes.has("socks5"))
            osInfo.service("restart", osInfo.isDebian ? "danted" : "sockd");
          console.log(
            `\n✅ Password successfully updated for user '${user}'.\n`,
          );
        } else {
          console.log(
            `\n❌ User '${user}' not found or protocol doesn't support changing passwords.\n`,
          );
        }
        break;
      }

      case "list": {
        console.log("\n🦊 ProxyFoxy - Proxies");
        console.log(
          "══════════════════════════════════════════════════════════",
        );
        const ip = await getPublicIp();

        if (db.proxies.length > 0) {
          db.proxies.forEach((p) => {
            if (p.type === "residential") {
              const c = p.country ? `[${p.country}]` : " [ANY]";
              console.log(
                `🟢 RESIDENTIAL${c} -> \x1b[32m${p.user}:${p.pass}@${ip}:${p.port}\x1b[0m`,
              );
            } else if (p.type === "mtproto") {
              console.log(
                `🟢 MTPROTO        -> \x1b[32mtg://proxy?server=${ip}&port=${p.port}&secret=${p.pass}\x1b[0m`,
              );
            } else {
              console.log(
                `🟢 ${p.type.toUpperCase().padEnd(14, " ")} -> \x1b[32m${p.user}:${p.pass}@${ip}:${p.port}\x1b[0m`,
              );
            }
          });
        } else {
          console.log("👥 No proxies configured.");
        }
        console.log(
          "══════════════════════════════════════════════════════════\n",
        );
        break;
      }

      case "status": {
        console.log(`\n📊 PROXYFOXY STATUS & ANALYTICS`);
        console.log(
          `══════════════════════════════════════════════════════════`,
        );

        function portOrService(port, serviceName) {
          if (osInfo && osInfo.isServiceRunning(serviceName)) return true;
          return runQuiet(`nc -z 127.0.0.1 ${port} 2>/dev/null`);
        }

        let squidStatus = portOrService(
          db.proxies.find((p) => p.type === "http")?.port || 0,
          "squid",
        )
          ? "🟢 RUNNING"
          : "🔴 STOPPED";
        let danteStatus = portOrService(
          db.proxies.find((p) => p.type === "socks5")?.port || 0,
          osInfo?.isDebian ? "danted" : "sockd",
        )
          ? "🟢 RUNNING"
          : "🔴 STOPPED";
        let gatewayPort = db.proxies.find((p) => p.type === "residential")?.gatewayPort || 9000;
        let masterStatus = portOrService(gatewayPort, "proxyfoxy-residential-master")
          ? "🟢 RUNNING"
          : "🔴 STOPPED";

        const mtprotoProxies = db.proxies.filter((p) => p.type === "mtproto");

        console.log(`🛠️  CORE SERVICES:`);
        console.log(`   ├─ HTTP (Squid):    ${squidStatus}`);
        console.log(`   ├─ SOCKS5 (Dante):  ${danteStatus}`);
        console.log(`   ├─ Master Gateway:  ${masterStatus}`);
        if (mtprotoProxies.length > 0) {
          mtprotoProxies.forEach((p, i) => {
            const prefix = i < mtprotoProxies.length - 1 ? "├─" : "└─";
            const mtgStatus = portOrService(p.port, `proxyfoxy-mtproto-${p.port}`)
              ? "🟢 RUNNING"
              : "🔴 STOPPED";
            console.log(
              `   ${prefix} MTProto :${p.port}  ${mtgStatus}`,
            );
          });
        }
        console.log();

        console.log(`📈 TRAFFIC BY PORT:`);
        if (db.proxies.length > 0) {
          db.proxies.forEach((p) => {
            const t = trackTraffic(p.port);
            let limitStr = p.limit ? ` (Limit: ${formatBytes(p.limit)})` : "";
            console.log(
              `   ├─ Port ${p.port} [${p.type.toUpperCase()}]${limitStr}`,
            );
            console.log(
              `   │  └─ Data: ${formatBytes(t.rx)} IN / ${formatBytes(t.tx)} OUT`,
            );
          });
        } else {
          console.log(`   └─ No proxies configured.\n`);
        }

        let resState = [];
        try {
          resState = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
        } catch (e) {}

        if (resState.length > 0) {
          console.log(`\n🏠 RESIDENTIAL PROVIDER POOL:`);
          const byCountry = {};
          let totalRx = 0,
            totalTx = 0;
          resState.forEach((node) => {
            if (!byCountry[node.country])
              byCountry[node.country] = { nodes: [], rx: 0, tx: 0 };
            byCountry[node.country].nodes.push(node);
            byCountry[node.country].rx += node.rx;
            byCountry[node.country].tx += node.tx;
            totalRx += node.rx;
            totalTx += node.tx;
          });

          for (const [country, stats] of Object.entries(byCountry)) {
            console.log(
              `   🌍 ${country}: ${stats.nodes.length} Node${stats.nodes.length > 1 ? "s" : ""} Active`,
            );
            stats.nodes.forEach((n, i) => {
              const prefix = i < stats.nodes.length - 1 ? "├─" : "├─";
              console.log(
                `      ${prefix} ${n.ip} — ${formatBytes(n.rx)} IN / ${formatBytes(n.tx)} OUT`,
              );
            });
            console.log(
              `      └─ Subtotal: ${formatBytes(stats.rx)} IN / ${formatBytes(stats.tx)} OUT`,
            );
          }
          console.log(
            `\n   📊 Total: ${resState.length} Node${resState.length > 1 ? "s" : ""} — ${formatBytes(totalRx)} IN / ${formatBytes(totalTx)} OUT`,
          );
        }
        console.log(
          `══════════════════════════════════════════════════════════\n`,
        );
        break;
      }

      case "stop":
      case "start": {
        const target = args[0];
        let toManage = [];

        if (!target) toManage = db.proxies;
        else if (["http", "socks5", "mtproto", "residential"].includes(target))
          toManage = db.proxies.filter((p) => p.type === target);
        else toManage = db.proxies.filter((p) => p.port == target);

        const types = [...new Set(toManage.map((p) => p.type))];
        if (types.includes("http")) osInfo.service(command, "squid");
        if (types.includes("socks5"))
          osInfo.service(command, osInfo.isDebian ? "danted" : "sockd");
        if (types.includes("residential"))
          osInfo.service(command, `proxyfoxy-residential-master`);
        toManage.forEach((p) => {
          if (p.type === "mtproto")
            osInfo.service(command, `proxyfoxy-mtproto-${p.port}`);
        });

        console.log(
          `\n✅ Successfully executed '${command}' on requested services.\n`,
        );
        break;
      }

      case "delete": {
        const [user, port] = args;
        if (!user || !port)
          return console.log("\n❌ Usage: proxyfoxy delete <user> <port>\n");

        validateUser(user);
        validatePort(port);

        const proxy = db.proxies.find((p) => p.port == port && p.user === user);
        if (!proxy) return console.log("\n❌ Proxy not found in database.\n");

        if (osInfo) configureFirewall(port, osInfo, true);

        if (proxy.type === "http") {
          runQuiet(`htpasswd -D /etc/squid/passwords ${shellEscape(user)}`);
          runQuiet(`sed -i '/^http_port ${port}$/d' /etc/squid/squid.conf`);
          if (osInfo.isServiceRunning("squid"))
            runQuiet(
              osInfo.isAlpine
                ? "squid -k reconfigure"
                : "systemctl reload squid",
            );
          else osInfo.service("restart", "squid");
        } else if (proxy.type === "socks5") {
          runQuiet(
            osInfo.isAlpine
              ? `deluser ${shellEscape(user)}`
              : `userdel ${shellEscape(user)}`,
          );
          osInfo.service("restart", osInfo.isDebian ? "danted" : "sockd");
        } else if (proxy.type === "mtproto" || proxy.type === "residential") {
          const svcName =
            proxy.type === "mtproto"
              ? `proxyfoxy-mtproto-${port}`
              : `proxyfoxy-residential-master`;
          osInfo.service("stop", svcName);
          if (osInfo.isAlpine)
            runQuiet(
              `rc-update del ${svcName} default && rm -f /etc/init.d/${svcName}`,
            );
          else
            runQuiet(
              `systemctl disable ${svcName} && rm -f /etc/systemd/system/${svcName}.service && systemctl daemon-reload`,
            );
        }

        db.proxies = db.proxies.filter((p) => p !== proxy);
        saveDb();
        console.log(`\n✅ Deleted ${proxy.type} proxy on port ${port}.\n`);
        break;
      }

      case "uninstall": {
        console.log("\n⚠️  Wiping ProxyFoxy from this machine completely...");

        // Stop base services
        osInfo.service("stop", "squid");
        osInfo.service("stop", osInfo.isDebian ? "danted" : "sockd");
        osInfo.service("stop", "proxyfoxy-residential-master");

        // Cleanup DB, State & Firewall rules
        db.proxies.forEach((p) => configureFirewall(p.port, osInfo, true));
        const gwPort = db.proxies.find((p) => p.type === "residential")?.gatewayPort || 9000;
        configureFirewall(gwPort, osInfo, true);
        if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
        if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);

        // Remove binaries and configs
        runQuiet(
          `rm -rf /etc/squid /etc/danted.conf /etc/sockd.conf /usr/local/bin/mtg`,
        );

        // Remove individual service files
        if (osInfo.isAlpine) {
          runQuiet(
            `find /etc/init.d/ -name 'proxyfoxy-*' -exec rc-update del {} default \\; -exec rm -f {} \\;`,
          );
        } else {
          runQuiet(
            `systemctl disable squid danted proxyfoxy-residential-master 2>/dev/null`,
          );
          runQuiet(
            `find /etc/systemd/system/ -name 'proxyfoxy-*.service' -delete && systemctl daemon-reload`,
          );
        }

        console.log(`✅ Uninstallation successful. Your system is clean.\n`);
        break;
      }

      default:
        if (command && command !== "docker")
          console.log(`\n❌ Unknown command: ${command}`);
        if (command !== "docker") printHelp();

        // Handle docker gracefully at bottom
        if (command === "docker") {
          const [dUser, dPass, dPort, dProto] = args;
          if (!dUser || !dPass || !dPort) {
            console.log(
              "\n❌ Usage: docker run ... proxyfoxy <user> <pass> <port> [protocol]\n",
            );
            process.exit(1);
          }
          validateUser(dUser);
          validatePort(dPort);
          const protocol = (dProto || "http").toLowerCase();
          console.log(
            `\n🐳 Initializing Docker [${protocol.toUpperCase()}] -> Port: ${dPort}...\n`,
          );

          if (protocol === "http") {
            run("mkdir -p /etc/squid && touch /etc/squid/passwords");
            run(
              `htpasswd -b -c /etc/squid/passwords ${shellEscape(dUser)} ${shellEscape(dPass)}`,
            );
            run(
              `sh -c 'AUTH_PATH=$(find /usr/lib/squid /usr/lib64/squid /usr/libexec/squid -name basic_ncsa_auth 2>/dev/null | head -n 1)\ncat <<EOF > /etc/squid/squid.conf\nhttp_port ${dPort}\nauth_param basic program $AUTH_PATH /etc/squid/passwords\nacl authenticated proxy_auth REQUIRED\nhttp_access allow authenticated\nhttp_access deny all\nEOF'`,
            );
            execSync("squid -N -d 1", { stdio: "inherit" });
          } else if (protocol === "socks5") {
            run(
              `adduser -H -D ${shellEscape(dUser)} 2>/dev/null || true; echo ${shellEscape(dUser)}:${shellEscape(dPass)} | chpasswd`,
            );
            fs.writeFileSync(
              "/etc/sockd.conf",
              `logoutput: stderr\ninternal: 0.0.0.0 port = ${dPort}\nexternal: eth0\nsocksmethod: username\nclientmethod: none\nuser.privileged: root\nuser.unprivileged: nobody\nclient pass { from: 0.0.0.0/0 to: 0.0.0.0/0 }\nsocks pass { from: 0.0.0.0/0 to: 0.0.0.0/0 }\n`,
            );
            execSync("sockd -f /etc/sockd.conf", { stdio: "inherit" });
          } else if (protocol === "mtproto") {
            // Dynamically grab the correct arch for Docker container
            const arch = require("os").arch() === "arm64" ? "arm64" : "amd64";
            run(
              `wget -qO- https://github.com/9seconds/mtg/releases/download/v2.2.8/mtg-2.2.8-linux-${arch}.tar.gz | tar -xz -C /tmp && mv /tmp/mtg-*/mtg /usr/local/bin/mtg && chmod +x /usr/local/bin/mtg`,
            );
            require("child_process").execSync(
              `/usr/local/bin/mtg run -b 0.0.0.0:${dPort} ${dPass}`,
              { stdio: "inherit" },
            );
          } else if (protocol === "residential") {
            db.proxies = db.proxies.filter((p) => p.port != dPort);
            db.proxies.push({
              type: "residential",
              user: dUser,
              pass: dPass,
              port: dPort,
              country: flags.country,
              limit: flags.limit,
              gatewayPort: flags.gateway,
            });
            saveDb();
            serveResidentialMaster(flags.gateway);
          }
        }
    }
  } catch (error) {
    console.error(
      "\n❌ An error occurred processing the command. Check privileges and network.\n",
    );
  }
})();
