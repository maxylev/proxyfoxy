# 🦊 ProxyFoxy

[![NPM Version](https://img.shields.io/npm/v/proxyfoxy?style=flat-square&color=cb3837)](https://www.npmjs.com/package/proxyfoxy)
[![Docker Image Version](https://img.shields.io/github/v/release/maxylev/proxyfoxy?label=Docker%20Image&style=flat-square&color=0db7ed)](https://github.com/maxylev/proxyfoxy/packages)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**The ultimate 1-command cross-platform proxy server manager.**

ProxyFoxy is a zero-dependency Node.js CLI tool that instantly installs, configures, and manages authenticated HTTP proxies (`host:port:user:pass`) using Squid.

Stop wrestling with Linux config files, permissions, and firewall rules. ProxyFoxy automatically detects your OS, installs the requirements, opens the correct firewall ports, and hands you a ready-to-paste proxy string in seconds.

---

## 🚀 Quick Start

You don't need to manually install or clone anything! Connect to your fresh VPS and run it instantly via `npx` (requires Node.js):

```bash
npx proxyfoxy add myuser supersecret123 8000
```

**What happens behind the scenes?**

1. Detects your Linux distribution (Ubuntu, Debian, CentOS, RHEL, Alpine).
2. Installs `squid` and required utilities natively.
3. Creates an encrypted user account.
4. Opens Port `8000` in your firewall (`ufw` or `firewalld`).
5. Starts the service and outputs: `🟢 192.168.1.50:8000:myuser:supersecret123`

---

## 🛠️ CLI Command Reference

Manage multiple proxies on the same server easily. Run these commands anytime:

### ➕ Manage Proxies

| Command                                  | Description                                                         |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `npx proxyfoxy add <user> <pass> <port>` | Installs dependencies (if needed), adds a user, and opens a port.   |
| `npx proxyfoxy change <user> <newpass>`  | Changes the password for an existing proxy user instantly.          |
| `npx proxyfoxy delete <user> <port>`     | Deletes a user account and cleanly closes the port in the firewall. |

### 📊 Monitor Setup

| Command                | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `npx proxyfoxy list`   | Beautifully lists all active proxy users and open ports.        |
| `npx proxyfoxy status` | Checks if the proxy server is currently `running` or `stopped`. |

### ⚙️ Server Controls

| Command                   | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `npx proxyfoxy stop`      | Temporarily stops the proxy service (rejects all traffic).                  |
| `npx proxyfoxy start`     | Starts the proxy service back up.                                           |
| `npx proxyfoxy uninstall` | **Danger:** Completely removes Squid, wipes passwords, and deletes configs. |

---

## 🐳 Docker Container Usage

If you prefer containers, ProxyFoxy has a highly optimized, ~35MB Alpine-based Docker image available on the GitHub Container Registry.

**Run the proxy in the background:**
_(Note: We map a range of ports `-p 8000-8010:8000-8010` so you can add more proxies later dynamically!)_

```bash
docker run -d -p 8000-8010:8000-8010 --name my-proxy ghcr.io/maxylev/proxyfoxy myuser mypass 8000
```

**Manage your running container on the fly:**
You can interact with your proxy dynamically without restarting the container:

```bash
docker exec -it my-proxy proxyfoxy list
docker exec -it my-proxy proxyfoxy change myuser newpassword
docker exec -it my-proxy proxyfoxy add user2 pass2 8001
```

---

## 💡 How to Use Your Proxy

Once ProxyFoxy finishes running, simply paste the output into your browser, web scraper, or proxy manager.

**Standard Format:**
`IP_ADDRESS:PORT:USERNAME:PASSWORD`

**Test your proxy via cURL:**

```bash
curl -x http://myuser:supersecret123@192.168.1.50:8000 https://ifconfig.me
```

_(If successful, this will return your proxy server's IP address instead of your home IP)._

---

## 🛡️ License

This project is licensed under the MIT License.
