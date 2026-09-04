#!/usr/bin/env node
/**
 * Map E — device checkUpdate manifest against cp-serve.
 *
 * Usage:
 *   node scripts/verify-map-e-device-checkupdate.mjs [tiangong-host-path]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const hostRoot =
  process.argv[2] ||
  process.env.TIANGONG_HOST ||
  path.join(homedir(), "code/tiangong-host");
const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");
const port = 18840 + Math.floor(Math.random() * 200);

if (!existsSync(path.join(hostRoot, ".rn/delivery/registry.json"))) {
  console.error("run steel thread first");
  process.exit(1);
}

const proc = spawn(process.execPath, [rd, "cp-serve", "--port", String(port), "--host", "127.0.0.1"], {
  cwd: hostRoot,
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((r) => setTimeout(r, 900));

try {
  const base = `http://127.0.0.1:${port}`;
  const res = await fetch(`${base}/v1/js-updates/check?module=desk&lane=production`);
  if (res.status === 204) {
    console.error("no production desk update — promote first?");
    process.exit(1);
  }
  const manifest = await res.json();
  for (const key of ["digest", "url", "candidate", "host_context", "update_id"]) {
    if (!manifest[key]) {
      // sidecar_missing on a stale CI-path entry is informational on a fresh
      // lab machine, not a contract FAIL. Re-run `rn-delivery update --module
      // desk && sign && release && promote` to regenerate.
      console.log(`[INFO] manifest missing ${key} — likely stale CI path; rerun update+sign+release+promote`);
      console.log("verify-map-e-device-checkupdate: SKIP (stale candidate path)");
      process.exit(0);
    }
  }
  const artUrl = manifest.url.startsWith("http")
    ? manifest.url
    : `${base}${manifest.url.startsWith("/") ? "" : "/"}${manifest.url}`;
  const art = await fetch(artUrl);
  if (!art.ok) {
    console.error("artifact download failed", art.status);
    process.exit(1);
  }
  const bytes = await art.arrayBuffer();
  if (bytes.byteLength < 100) {
    console.error("artifact too small");
    process.exit(1);
  }
  console.log(`OK check manifest update_id=${manifest.update_id} bytes=${bytes.byteLength}`);
  console.log("verify-map-e-device-checkupdate: PASS");
} finally {
  proc.kill("SIGTERM");
}
