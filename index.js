#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const https = require("https");

const [, , command, ...args] = process.argv;

// Helper to run terminal commands cleanly
const run = (cmd, showOutput = true) =>
  execSync(cmd, { stdio: showOutput ? "inherit" : "ignore" });

// Graceful sudo (For Docker/root-native environments)
const sudo = process.getuid && process.getuid() === 0 ? "" : "sudo ";

function printHelp() {
  console.log(`
🦊 ProxyFoxy - 1-Command Proxy Manager

Usage:
  npx proxyfoxy add <user> <pass> <port>    # Install/Add new proxy user & port
  npx proxyfoxy change <user> <newpass>     # Change an existing user's password
  npx proxyfoxy delete <user> <port>        # Delete a user, remove port & close firewall
  npx proxyfoxy list                        # Show all active users and ports
  npx proxyfoxy status                      # Check if proxy service is running
  npx proxyfoxy stop                        # Stop the proxy service
  npx proxyfoxy start                       # Start the proxy service
  npx proxyfoxy uninstall                   # Completely remove the proxy server
  
Docker Usage:
  npx proxyfoxy docker <user> <pass> <port> # Run proxy in foreground (for containers)
  `);
}

// Fetch IP using a single URL promise
function fetchIp(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 2000 }, (res) => {
      let ip = "";
      res.on("data", (chunk) => (ip += chunk));
      res.on("end", () => resolve(ip.trim()));
    });
    req.on("timeout", () => {
      req.destroy();
      reject("timeout");
    });
    req.on("error", () => reject("error"));
  });
}

// Resilient multi-provider IP fetcher
async function getPublicIp() {
  const providers = [
    "https://icanhazip.com",
    "https://ifconfig.me",
    "https://ipinfo.io/ip",
  ];

  for (const url of providers) {
    try {
      const ip = await fetchIp(url);
      // Basic regex to ensure we actually got an IP and not an HTML error page
      if (/^[\d\.]+$/.test(ip)) return ip;
    } catch (e) {
      continue; // If one fails, try the next provider instantly
    }
  }
  return "YOUR_SERVER_IP";
}

// Advanced OS Detection Engine
function detectOS() {
  if (process.platform !== "linux" || !fs.existsSync("/etc/os-release"))
    return null;

  const osRelease = fs.readFileSync("/etc/os-release", "utf8").toLowerCase();

  if (osRelease.includes("alpine")) {
    return {
      family: "alpine",
      install: `${sudo}apk update && ${sudo}apk add squid apache2-utils`,
      uninstall: `${sudo}apk del squid apache2-utils`,
      fwAdd: () => `echo "🛡️ Firewall handled by Docker or host system."`,
      fwRemove: () => `echo "🛡️ Firewall handled by Docker or host system."`,
      // Alpine dynamically uses Squid commands directly, ignoring systemctl
      restart: `${sudo}squid -k reconfigure 2>/dev/null || ${sudo}rc-service squid restart 2>/dev/null || true`,
      start: `${sudo}squid 2>/dev/null || ${sudo}rc-service squid start 2>/dev/null || true`,
      stop: `${sudo}squid -k shutdown 2>/dev/null || ${sudo}rc-service squid stop 2>/dev/null || true`,
      status: `${sudo}squid -k check 2>/dev/null`,
    };
  }

  if (osRelease.includes("debian") || osRelease.includes("ubuntu")) {
    return {
      family: "debian",
      install: `${sudo}apt-get update && ${sudo}apt-get install -y squid apache2-utils ufw`,
      uninstall: `${sudo}apt-get purge -y squid apache2-utils`,
      fwAdd: (port) => `${sudo}ufw allow ${port}/tcp`,
      fwRemove: (port) => `${sudo}ufw delete allow ${port}/tcp`,
      restart: `${sudo}systemctl restart squid && ${sudo}systemctl enable squid`,
      start: `${sudo}systemctl start squid`,
      stop: `${sudo}systemctl stop squid`,
      status: `${sudo}systemctl is-active squid`,
    };
  }

  if (
    osRelease.includes("centos") ||
    osRelease.includes("rhel") ||
    osRelease.includes("fedora") ||
    osRelease.includes("almalinux") ||
    osRelease.includes("rocky")
  ) {
    return {
      family: "rhel",
      install: `${sudo}dnf install -y squid httpd-tools firewalld || ${sudo}yum install -y squid httpd-tools firewalld`,
      uninstall: `${sudo}dnf remove -y squid httpd-tools || ${sudo}yum remove -y squid httpd-tools`,
      fwAdd: (port) =>
        `${sudo}systemctl enable firewalld && ${sudo}systemctl start firewalld && ${sudo}firewall-cmd --permanent --add-service=ssh >/dev/null 2>&1 && ${sudo}firewall-cmd --permanent --add-port=${port}/tcp && ${sudo}firewall-cmd --reload`,
      fwRemove: (port) =>
        `${sudo}firewall-cmd --permanent --remove-port=${port}/tcp && ${sudo}firewall-cmd --reload`,
      restart: `${sudo}systemctl restart squid && ${sudo}systemctl enable squid`,
      start: `${sudo}systemctl start squid`,
      stop: `${sudo}systemctl stop squid`,
      status: `${sudo}systemctl is-active squid`,
    };
  }

  return null;
}

const osInfo = detectOS();

if (!osInfo) {
  console.error(
    "❌ ProxyFoxy supports Debian/Ubuntu, RHEL families, and Alpine Linux.",
  );
  process.exit(1);
}

if (!command) {
  printHelp();
  process.exit(1);
}

// Main Execution
(async () => {
  try {
    switch (command) {
      // ---------- DOCKER FOREGROUND MODE ----------
      case "docker": {
        const [user, pass, port] = args;
        if (!user || !pass || !port)
          return console.log("❌ Usage: proxyfoxy docker <user> <pass> <port>");

        console.log(
          `\n🐳 Initializing Docker Proxy -> Port: ${port} | User: ${user}...\n`,
        );

        run("mkdir -p /etc/squid");
        run("touch /etc/squid/passwords");
        run(`htpasswd -b -c /etc/squid/passwords ${user} ${pass}`);

        const setupAuth = `AUTH_PATH=$(find /usr/lib/squid /usr/lib64/squid /usr/libexec/squid -name basic_ncsa_auth 2>/dev/null | head -n 1)
cat <<EOF > /etc/squid/squid.conf
http_port ${port}
auth_param basic program $AUTH_PATH /etc/squid/passwords
acl authenticated proxy_auth REQUIRED
http_access allow authenticated
http_access deny all
EOF`;
        run(`sh -c '${setupAuth}'`);

        console.log("\n🔥 Starting Squid in foreground...");

        run("squid -N -z 2>/dev/null || true");
        run("rm -f /var/run/squid*.pid /run/squid*.pid 2>/dev/null || true");

        require("child_process").execSync("squid -N -d 1", {
          stdio: "inherit",
        });
        break;
      }

      // ---------- STANDARD VPS INSTALL ----------
      case "add": {
        const [user, pass, port] = args;
        if (!user || !pass || !port)
          return console.log(
            "❌ Usage: npx proxyfoxy add <user> <pass> <port>",
          );

        console.log(
          `\n🚀 Setting up proxy -> Port: ${port} | User: ${user}...\n`,
        );
        console.log(
          `📦 1/4 Installing for ${osInfo.family.toUpperCase()} system...`,
        );
        run(osInfo.install);

        console.log("\n🔐 2/4 Configuring Authentication...");
        run(`${sudo}touch /etc/squid/passwords`);
        run(`${sudo}htpasswd -b /etc/squid/passwords ${user} ${pass}`);

        console.log("\n⚙️  3/4 Configuring Port & Rules...");

        const setupAuth = `${sudo}grep -q "auth_param basic" /etc/squid/squid.conf 2>/dev/null || ${sudo}bash -c '
AUTH_PATH=$(find /usr/lib/squid /usr/lib64/squid /usr/libexec/squid -name basic_ncsa_auth 2>/dev/null | head -n 1)
cat <<EOF > /etc/squid/squid.conf
auth_param basic program $AUTH_PATH /etc/squid/passwords
acl authenticated proxy_auth REQUIRED
http_access allow authenticated
http_access deny all
EOF'`;
        run(setupAuth);

        const setupPort = `${sudo}grep -q "^http_port ${port}$" /etc/squid/squid.conf 2>/dev/null || echo "http_port ${port}" | ${sudo}tee -a /etc/squid/squid.conf`;
        run(setupPort);

        console.log("\n🔥 4/4 Opening Firewall & Restarting Service...");
        run(osInfo.fwAdd(port));
        run(osInfo.restart);

        const ip = await getPublicIp();
        console.log(`\n✅ SUCCESS! Proxy is live and running.`);
        console.log(
          `🌐 Ready to paste: \x1b[32m${ip}:${port}:${user}:${pass}\x1b[0m\n`,
        );
        break;
      }

      case "change": {
        const [user, newpass] = args;
        if (!user || !newpass)
          return console.log("❌ Usage: npx proxyfoxy change <user> <newpass>");
        console.log(`🔐 Changing password for user: ${user}...`);
        run(`${sudo}htpasswd -b /etc/squid/passwords ${user} ${newpass}`);
        run(osInfo.restart);
        console.log(`✅ Password updated successfully.`);
        break;
      }

      case "delete": {
        const [user, port] = args;
        if (!user || !port)
          return console.log("❌ Usage: npx proxyfoxy delete <user> <port>");
        console.log(`🗑️ Deleting user ${user} and closing port ${port}...`);
        try {
          run(`${sudo}htpasswd -D /etc/squid/passwords ${user}`, false);
        } catch (e) {}
        run(`${sudo}sed -i '/^http_port ${port}$/d' /etc/squid/squid.conf`);
        try {
          run(osInfo.fwRemove(port), false);
        } catch (e) {}
        run(osInfo.restart);
        console.log(`✅ User and port deleted successfully.`);
        break;
      }

      case "list": {
        console.log("\n🦊 ProxyFoxy - Active Configuration");
        console.log("═══════════════════════════════════════════\n");

        let users = [];
        if (fs.existsSync("/etc/squid/passwords")) {
          users = fs
            .readFileSync("/etc/squid/passwords", "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split(":")[0]);
        }

        if (users.length > 0) {
          console.log(`👥 USERS (${users.length}):`);
          users.forEach((u) => console.log(`   ✅ ${u}`));
        } else {
          console.log("👥 USERS: None configured.");
        }

        let ports = [];
        if (fs.existsSync("/etc/squid/squid.conf")) {
          ports = fs
            .readFileSync("/etc/squid/squid.conf", "utf8")
            .split("\n")
            .filter((line) => line.startsWith("http_port "))
            .map((line) => line.split(" ")[1]);
        }

        if (ports.length > 0) {
          console.log(`\n🔌 OPEN PORTS (${ports.length}):`);
          ports.forEach((p) => console.log(`   🌐 ${p}`));
        } else {
          console.log(`\n🔌 OPEN PORTS: None configured.`);
        }

        console.log("\n💡 Format: IP_ADDRESS:PORT:USER:PASSWORD");
        console.log("═══════════════════════════════════════════\n");
        break;
      }

      case "status": {
        console.log(`📊 Checking proxy status...`);
        try {
          // Relies on exit code. Both systemctl and squid return 0 if active.
          run(osInfo.status, false);
          console.log(`✅ Service is actively running.`);
        } catch (e) {
          console.log(`❌ Service is stopped or not installed.`);
        }
        break;
      }

      case "stop": {
        console.log(`🛑 Stopping proxy service...`);
        try {
          run(osInfo.stop);
        } catch (e) {}
        console.log(`✅ Proxy service stopped.`);
        break;
      }

      case "start": {
        console.log(`🟢 Starting proxy service...`);
        try {
          run(osInfo.start);
        } catch (e) {}
        console.log(`✅ Proxy service started.`);
        break;
      }

      case "uninstall": {
        console.log(`⚠️  WARNING: Completely removing proxy server...`);
        try {
          run(osInfo.stop, false);
        } catch (e) {}
        try {
          run(osInfo.uninstall);
        } catch (e) {}
        try {
          run(`${sudo}rm -rf /etc/squid`);
        } catch (e) {}
        console.log(`✅ Proxy server has been wiped from this machine.`);
        break;
      }

      default:
        console.log(`❌ Unknown command: ${command}`);
        printHelp();
    }
  } catch (error) {
    console.error(
      "\n❌ An error occurred. Ensure you have the right permissions (Root/Sudo).",
    );
  }
})();
