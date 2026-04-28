# 🦊 ProxyFoxy

[![NPM Version](https://img.shields.io/npm/v/proxyfoxy?style=flat-square&color=cb3837)](https://www.npmjs.com/package/proxyfoxy)
[![Tests](https://img.shields.io/github/actions/workflow/status/maxylev/proxyfoxy/test.yml?label=Tests&style=flat-square)](https://github.com/maxylev/proxyfoxy/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**The ultimate cross-platform, multi-protocol proxy manager featuring real-time analytics and a Built-in Distributed Residential Network.**

Instantly install, configure, and manage authenticated proxies on your VPS. ProxyFoxy automatically handles OS detection, package management (`Squid`, `Dante`, `MTG`), kernel-level firewall configurations, and real-time traffic data tracking.

---

## ✨ Features

- **4 Protocols Supported Native:** HTTP, SOCKS5, MTProto, and Custom Residential.
- **Zero-Overhead Analytics:** Uses kernel `iptables` to track proxy traffic (Sent/Received GB) with zero CPU strain on Node.js.
- **Create Your Own Residential Network:** Link home computers to your VPS and route consumer traffic strictly through designated geographic locations.
- **Hot-Reloading:** Change passwords and add new proxies without disconnecting currently active users.
- **Instant Output:** Formats proxies beautifully into `user:pass@ip:port` for immediate copy-pasting.

---

## 🚀 Quick Start

Connect to your VPS and run `proxyfoxy` instantly via `npx` (Requires Node.js):

```bash
npx proxyfoxy add myuser supersecret123 8000
```

```
🚀 Deploying HTTP Proxy -> Port: 8000...

✅ SUCCESS! Proxy is live.

   🌐 Ready to use: myuser:supersecret123@203.0.113.50:8000
```

---

## 📡 Supported Architectures

You can specify the protocol flag to deploy different proxy architectures natively:

### HTTP (Squid)

```bash
npx proxyfoxy add myuser mypass 8000 http
```

```
🚀 Deploying HTTP Proxy -> Port: 8000...

✅ SUCCESS! Proxy is live.

   🌐 Ready to use: myuser:mypass@203.0.113.50:8000
```

<p align="center"><img src="https://raw.githubusercontent.com/maxylev/proxyfoxy/refs/heads/main/assets/proxyfoxy-http.svg" alt="HTTP Proxy Architecture"></p>

### SOCKS5 (Dante)

```bash
npx proxyfoxy add myuser mypass 8001 socks5
```

```
🚀 Deploying SOCKS5 Proxy -> Port: 8001...

✅ SUCCESS! Proxy is live.

   🌐 Ready to use: myuser:mypass@203.0.113.50:8001
```

<p align="center"><img src="https://raw.githubusercontent.com/maxylev/proxyfoxy/refs/heads/main/assets/proxyfoxy-socks5.svg" alt="SOCKS5 Proxy Architecture"></p>

### MTProto (Telegram)

```bash
npx proxyfoxy add myuser skip 8002 mtproto
```

```
🚀 Deploying MTPROTO Proxy -> Port: 8002...

✅ SUCCESS! Proxy is live.

   🌐 TG Link: tg://proxy?server=203.0.113.50&port=8002&secret=ee...bHM
```

<p align="center"><img src="https://raw.githubusercontent.com/maxylev/proxyfoxy/refs/heads/main/assets/proxyfoxy-mtproto.svg" alt="MTProto Proxy Architecture"></p>

### Residential (Distributed Relay)

```bash
npx proxyfoxy add res_user res_pass 8003 residential --country=US --limit=2GB
```

```
🚀 Deploying RESIDENTIAL Proxy -> Port: 8003...

✅ SUCCESS! Proxy is live.

   🌐 Proxy: res_user:res_pass@203.0.113.50:8003
   🏠 Home PC string: npx proxyfoxy provider 203.0.113.50:9000
```

You can specify a required country code (`--country=XX`) and a strict data limit (`--limit=XGB`). If the data limit is hit, connections are instantly severed.

<p align="center"><img src="https://raw.githubusercontent.com/maxylev/proxyfoxy/refs/heads/main/assets/proxyfoxy-residential.svg" alt="Residential Proxy Architecture"></p>

---

## 🏠 The Residential Relay Network

ProxyFoxy allows you to create your own distributed residential proxy pool (similar to BrightData or Honeygain). Home PCs connect to your Master VPS and donate their IPs. Consumers connect to your VPS, which invisibly relays the traffic to the Home PC.

### Run the Provider Script on a Home PC

Anyone can run this locally to inject themselves into the proxy pool. ProxyFoxy will auto-detect the Home PC's country using IP APIs. No credentials needed — just point it at your VPS.

```bash
npx proxyfoxy provider <VPS_IP>:9000
```

```
✅ Connected! Proxying traffic globally...
```

```bash
# Suppress reconnect messages (useful for Docker / PM2 / systemd)
npx proxyfoxy provider <VPS_IP>:9000 --quiet

# Run it in the background / on boot
npm install -g pm2 && \
pm2 start "npx proxyfoxy provider <VPS_IP>:9000" --name "proxy-exit-node" --quiet && \
pm2 startup
```

Providers that gracefully stop (SIGTERM/SIGINT) are disconnected without penalty. Providers that abruptly disconnect too often (>5 times in 10 minutes) are automatically blacklisted.

### Manage Providers (on VPS)

Control which providers can join your network with blacklists and whitelists.

```bash
npx proxyfoxy providers                           # List connected / blacklisted providers
npx proxyfoxy providers block <ip> [reason]       # Blacklist a provider IP
npx proxyfoxy providers unblock <ip>              # Remove IP from blacklist
npx proxyfoxy providers whitelist <ip>            # Restrict to only whitelisted IPs
npx proxyfoxy providers unwhitelist <ip>          # Remove IP from whitelist
```

```
🏠 PROVIDER MANAGEMENT
════════════════════════════════════════════

🟢 Connected (2):
   ├─ 198.51.100.22 [US] since 2026-04-28T14:30:00.000Z
   ├─ 203.0.113.85 [DE] since 2026-04-28T14:32:15.000Z

🚫 Blacklisted (1):
   ├─ 192.0.2.66 — suspicious (2026-04-28T15:00:00.000Z)
```

---

## 📊 CLI Command Reference & Analytics

### `list` — List All Proxies

```bash
npx proxyfoxy list
```

```
🦊 ProxyFoxy - Proxies
════════════════════════════════════════════════════════
🟢 HTTP           -> myuser:mypass@203.0.113.50:8000
🟢 SOCKS5         -> myuser:mypass@203.0.113.50:8001
🟢 MTPROTO        -> tg://proxy?server=203.0.113.50&port=8002&secret=ee...bHM
🟢 RESIDENTIAL [US] -> res_user:res_pass@203.0.113.50:8003
════════════════════════════════════════════════════════
```

### `status` — Analytics Dashboard

```bash
npx proxyfoxy status
```

```
📊 PROXYFOXY STATUS & ANALYTICS
════════════════════════════════════════════════════════
🛠️  CORE SERVICES:
   ├─ HTTP (Squid):    🟢 RUNNING
   ├─ SOCKS5 (Dante):  🟢 RUNNING
   └─ Master Gateway:  🟢 RUNNING

📈 TRAFFIC BY PORT:
   ├─ Port 8000 [HTTP]
   │  └─ Data: 1.2 GB IN / 856.4 MB OUT
   ├─ Port 8001 [SOCKS5]
   │  └─ Data: 512.0 KB IN / 256.0 KB OUT
   ├─ Port 8003 [RESIDENTIAL] (Limit: 2.00 GB)
   │  └─ Data: 450.2 MB IN / 312.8 MB OUT

🏠 RESIDENTIAL PROVIDER POOL:
   🌍 US: 2 Nodes Active
      ├─ 198.51.100.22 — 85.3 MB IN / 52.1 MB OUT
      ├─ 203.0.113.85 — 43.2 MB IN / 32.1 MB OUT
      └─ Subtotal: 128.5 MB IN / 84.2 MB OUT
   🌍 DE: 1 Node Active
      ├─ 192.0.2.10 — 42.0 MB IN / 31.2 MB OUT
      └─ Subtotal: 42.0 MB IN / 31.2 MB OUT

   📊 Total: 3 Nodes — 170.5 MB IN / 115.4 MB OUT
════════════════════════════════════════════════════════
```

### `change` — Hot-Reload Password

```bash
npx proxyfoxy change myuser newsecret456
```

```
✅ Password successfully updated for user 'myuser'.
```

Live-updates the password across all protocols for that user without dropping active connections.

### `delete` — Remove a Proxy

```bash
npx proxyfoxy delete myuser 8000
```

```
✅ Deleted http proxy on port 8000.
```

Safely deletes the user, closes the firewall port, and removes the service.

### `stop` / `start` — Halt or Resume Proxies

```bash
npx proxyfoxy stop 8000              # Stop a specific port
npx proxyfoxy start http             # Start all HTTP proxies
npx proxyfoxy stop                   # Stop everything
```

```
✅ Successfully executed 'stop' on requested services.
```

### `uninstall` — Nuclear Option

```bash
npx proxyfoxy uninstall
```

```
⚠️  Wiping ProxyFoxy from this machine completely...
✅ Uninstallation successful. Your system is clean.
```

Removes all proxies, databases, firewall rules, and service files.

---

## 🐳 Docker Container Usage

If you prefer containers, ProxyFoxy has an optimized Alpine-based Docker image available.

```bash
# Run HTTP Proxy
docker run -d -p 8000:8000 --name http-proxy ghcr.io/maxylev/proxyfoxy:latest myuser mypass 8000 http

# Run SOCKS5 Proxy
docker run -d -p 8001:8001 --name socks-proxy ghcr.io/maxylev/proxyfoxy:latest myuser mypass 8001 socks5

# Run MTProto Proxy
docker run -d -p 8002:8002 --name mtproto-proxy ghcr.io/maxylev/proxyfoxy:latest myuser mtpass 8002 mtproto

# Run Residential Master
docker run -d -p 8003:8003 -p 9000:9000 --name residential-proxy ghcr.io/maxylev/proxyfoxy:latest res_user res_pass 8003 residential
```

---

## 🧪 End-to-End Testing

ProxyFoxy includes a full Docker-based E2E test suite that validates all protocols, traffic analytics, data limits, password hot-reloading, provider management (blacklist/whitelist/graceful disconnect), and the complete residential relay flow.

```bash
cd e2e && docker compose up --build --abort-on-container-exit
```

The suite spins up a **Server** container (runs all proxy services) and a **Provider** container (simulates a Home PC exit node), then runs a comprehensive test battery covering every CLI command and network flow.

---

## 🛡️ License

This project is licensed under the MIT License.
