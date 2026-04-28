# 🦊 ProxyFoxy

**The ultimate 1-command cross-platform proxy server manager.**

ProxyFoxy is a zero-dependency CLI tool built on Node.js that securely installs, configures, and manages authenticated HTTP proxies (`host:port:user:pass`) using Squid.

It automatically fetches your public IP, configures your firewall, detects your OS (Ubuntu, RHEL, Alpine), and gives you a ready-to-paste green string for your services!

## 🚀 Quick Start (VPS Installer)

You don't even need to install it! Run it instantly via `npx` on your server:

```bash
npx proxyfoxy add myuser supersecret123 8000
```

**What happens?**

1. Detects your OS and installs dependencies.
2. Creates secure credentials.
3. Opens Port 8000 in your firewall (`ufw` or `firewalld`).
4. Outputs: `🟢 192.168.1.50:8000:myuser:supersecret123` _(Ready to copy-paste!)_

---

## 🐳 Docker / Container Setup (GHCR)

Want to run it on a Docker host, NAS, or Kubernetes cluster? ProxyFoxy supports a lightweight Alpine Docker image via GitHub Container Registry!

**Run the container in the background (`-d`) and map the port (`-p`):**

```bash
docker run -d -p 8000:8000 --name my-proxy ghcr.io/maxylev/proxyfoxy myuser mypass 8000
```

---

## 🛠️ VPS Command Reference

Manage multiple proxies on the same server effortlessly.

### Add & Manage

| Command                                  | Action                                                  |
| ---------------------------------------- | ------------------------------------------------------- |
| `npx proxyfoxy add <user> <pass> <port>` | Installs server (if needed), adds user, and opens port. |
| `npx proxyfoxy change <user> <newpass>`  | Changes the password for an existing user.              |
| `npx proxyfoxy delete <user> <port>`     | Deletes a user account and cleanly closes the port.     |

### Monitor & Control

| Command                   | Action                                                   |
| ------------------------- | -------------------------------------------------------- |
| `npx proxyfoxy list`      | Lists all active proxy users and open ports.             |
| `npx proxyfoxy uninstall` | **Danger:** Wipes the server and cleans up config files. |

---

## 💻 Supported Operating Systems

- **Debian Family:** Ubuntu, Debian
- **RedHat Family:** CentOS, AlmaLinux, Rocky Linux, Fedora, RHEL
- **Alpine / Containers:** Native Docker and `apk` package support.

## 🛡️ License

MIT License.
