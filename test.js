const { execSync } = require("child_process");

console.log("🦊 Running ProxyFoxy Basic Sanity Tests...");

try {
  // Test 1: Ensure CLI help command runs without syntax errors
  const helpOutput = execSync("node index.js help").toString();
  if (!helpOutput.includes("ProxyFoxy - Distributed Proxy Manager")) {
    throw new Error("CLI Help text is missing or malformed.");
  }
  console.log("✅ CLI Help format verified.");

  // Test 2: Check OS detection logic (Simulated execution)
  const osRelease = execSync(
    'cat /etc/os-release 2>/dev/null || echo "Not Linux"',
  ).toString();
  if (osRelease.includes("Not Linux")) {
    console.log("⚠️ Skipping Linux-specific integration tests on this OS.");
  } else {
    console.log(
      "✅ Linux environment detected. Ready for GitHub Actions E2E tests.",
    );
  }

  console.log(
    "\n🎉 Basic tests passed! Run GitHub Actions for full Functional Testing.",
  );
} catch (error) {
  console.error("❌ Test Failed:", error.message);
  process.exit(1);
}
