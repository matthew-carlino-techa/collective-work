#!/usr/bin/env bash
# Exclude account proxies from Cloudflare WARP so Open can reach them.
# Usage: bash scripts/bypass-warp-proxies.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v warp-cli >/dev/null 2>&1; then
  echo "warp-cli not found — nothing to do"
  exit 0
fi

node <<'NODE'
const { execFileSync } = require("child_process");
const Database = require("better-sqlite3");
const db = new Database("data/collective.db");
const rows = db
  .prepare(
    "SELECT DISTINCT trim(proxy_ip) AS ip FROM accounts WHERE trim(proxy_ip) != ''",
  )
  .all();

for (const { ip } of rows) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;
  for (const args of [
    ["tunnel", "ip", "add", ip],
    ["tunnel", "ip", "add-range", `${ip}/32`],
  ]) {
    try {
      execFileSync("warp-cli", args, { stdio: "inherit" });
    } catch {
      // already present or unsupported variant
    }
  }
  console.log("excluded from WARP:", ip);
}
NODE

echo "Done. Click Open again on the account."
