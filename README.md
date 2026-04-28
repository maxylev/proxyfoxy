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

## 🚀 Standard Usage (VPS Setup)

Connect to your VPS and run `proxyfoxy` instantly via `npx` (Requires Node.js):

```bash
npx proxyfoxy add myuser supersecret123 8000
```

_(By default, this installs a standard HTTP web proxy)._

### Supported Architectures

You can specify the protocol flag to deploy different proxy architectures natively:

- **HTTP (Squid):** `npx proxyfoxy add myuser mypass 8000 http`
- **SOCKS5 (Dante):** `npx proxyfoxy add myuser mypass 8001 socks5`
- **MTProto (Telegram):** `npx proxyfoxy add myuser skip 8002 mtproto`

---

## 🏠 The Residential Relay Network

ProxyFoxy allows you to create your own distributed residential proxy pool (similar to BrightData or Honeygain). Home PCs connect to your Master VPS and donate their IPs. Consumers connect to your VPS, which invisibly relays the traffic to the Home PC.

**1. Create a Master Node on your VPS**
You can specify a required country code (`--country=XX`) and a strict data limit (`--limit=XGB`). If the data limit is hit, connections are instantly severed.

```bash
npx proxyfoxy add res_user res_pass 8003 residential --country=US --limit=2GB
```

**2. Run the Provider Script on a Home PC**
Anyone can run this locally to inject themselves into the proxy pool. ProxyFoxy will auto-detect the Home PC's country using IP APIs.

```bash
npx proxyfoxy provider res_user:res_pass@<VPS_IP>:9000
```

##### How to run it in the background / on boot?

```bash
npm install -g pm2
pm2 start "npx proxyfoxy provider user:pass@ip:9000" --name "proxy-exit-node"
pm2 startup
```

**3. Consume the Proxy**
Set your browser extension or scraper to use the proxy generated in Step 1 (`VPS_IP:8003`).

---

## 📊 CLI Command Reference & Analytics

Manage multiple proxies and track bandwidth dynamically.

| Command                                                      | Description                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `npx proxyfoxy add <u/p/port> [proto] [--country] [--limit]` | Installs proxies, limits bandwidth, opens firewalls, and boots daemons.                           |
| `npx proxyfoxy change <user> <newpass>`                      | Live-updates a user's password without dropping connections.                                      |
| `npx proxyfoxy delete <user> <port>`                         | Safely deletes the user and permanently closes the firewall port.                                 |
| `npx proxyfoxy list`                                         | Lists all active proxies in a 1-click copy-paste format.                                          |
| `npx proxyfoxy status`                                       | **Analytics Dashboard:** View Sent/Received GB per Port, active IP pools, and country breakdowns. |
| `npx proxyfoxy stop/start [port/proto]`                      | Halt or resume specific proxies.                                                                  |
| `npx proxyfoxy uninstall`                                    | **Nuclear Option:** Wipes all proxies, databases, and dependencies.                               |

---

## 🐳 Docker Container Usage

If you prefer containers, ProxyFoxy has an optimized Alpine-based Docker image available.

```bash
# Run SOCKS5 Proxy dynamically
docker run -d -p 8001:8001 --name socks-proxy ghcr.io/maxylev/proxyfoxy:latest myuser mypass 8001 socks5
```

---

## 🛡️ License

This project is licensed under the MIT License.
