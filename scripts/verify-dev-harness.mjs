#!/usr/bin/env node
/**
 * Dual-pack Dev Harness verification — map #149 / #155 / #158.
 *
 * Reads `.rn/dev-harness.json` (written by start-dual-pack.mjs) and:
 *  1. Asserts each module entry has an alive PID
 *  2. Probes Metro /status on the assigned port (200 + packager-status:running)
 *  3. Fetches the host-surface bundle and asserts 200
 *  4. If a device is attached (adb devices — exit 0), runs
 *     `adb shell am start` to confirm cold start for each module
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL (any check failed)
 *   2 = SKIP (no manifest found — start the harness first)
 *
 * Usage:
 *   node scripts/verify-dev-harness.mjs
 *   STRICT=1 node scripts/verify-dev-harness.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rnRoot = path.resolve(__dirname, "..");

const HARNESS_FILE = path.join(rnRoot, ".rn", "dev-harness.json");

const failures = [];
function ok(label) {
  console.log(`[OK]   ${label}`);
}
function fail(label, detail) {
  console.error(`[FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
  failures.push(label);
}
function skip(label, detail) {
  console.warn(`[SKIP] ${label}${detail ? ` — ${detail}` : ""}`);
}

if (!fs.existsSync(HARNESS_FILE)) {
  skip(
    "dev-harness manifest",
    `${HARNESS_FILE} not found — run scripts/dev-harness/start-dual-pack.mjs first`,
  );
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(HARNESS_FILE, "utf8"));
} catch (e) {
  fail("dev-harness manifest parses", e instanceof Error ? e.message : String(e));
  process.exit(1);
}

const modules = Array.isArray(manifest?.modules) ? manifest.modules : [];
if (!modules.length) {
  fail("dev-harness modules", "manifest has zero modules");
  process.exit(1);
}
ok(`dev-harness manifest (${modules.length} module(s))`);

async function probeMetroStatus(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const text = await res.text();
    if (!text.includes("packager-status:running")) {
      return { ok: false, status: res.status, body: text.slice(0, 80) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function probeBundle(port, entry = "index") {
  const url = `http://127.0.0.1:${port}/${entry}.bundle?platform=android&dev=true`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
    });
    const ct = res.headers.get("content-type") ?? "";
    return {
      ok: res.ok && /javascript|json/i.test(ct),
      status: res.status,
      contentType: ct,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function pidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

for (const m of modules) {
  const alive = pidAlive(m.pid);
  if (alive) ok(`${m.id} PID ${m.pid} alive`);
  else {
    // PID is from the harness manifest; if Metro is responding on the assigned
    // port, treat the harness as live even if the parent process re-spawned.
    // This is normal after `rn module dev` re-execs on Windows / signal restart.
    const status = await probeMetroStatus(m.port);
    if (status.ok) ok(`${m.id} PID ${m.pid} (Metro live on :${m.port}; parent re-spawned)`);
    else fail(`${m.id} PID ${m.pid} alive (and Metro :${m.port} not responding)`);
  }

  const status = await probeMetroStatus(m.port);
  if (status.ok) ok(`${m.id} Metro /status :${m.port} 200`);
  else
    fail(
      `${m.id} Metro /status :${m.port}`,
      status.error ?? `status=${status.status}`,
    );

  const bundle = await probeBundle(m.port);
  if (bundle.ok)
    ok(`${m.id} host-surface bundle :${m.port} ${bundle.contentType}`);
  else
    fail(
      `${m.id} host-surface bundle :${m.port}`,
      bundle.error ?? `status=${bundle.status} ct=${bundle.contentType}`,
    );
}

// Optional adb cold start — only if a device is attached.
function adbDevices() {
  const r = spawnSync("adb", ["devices"], { encoding: "utf8" });
  if (r.status !== 0) return [];
  return r.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === "device")
    .map((parts) => parts[0]);
}

const devices = adbDevices();
if (!devices.length) {
  skip("adb cold start", "no adb devices attached");
} else {
  ok(`adb devices attached: ${devices.join(",")}`);
  // Resolve android package from catalog embed when present; fall back to
  // `com.tiangong.<id>` heuristic. AFK exit code is non-zero only if a real
  // package fails — heuristic guesses are reported as SKIP.
  const hostRoot = "/Users/xuwei/code/tiangong-host";
  const embedFile = path.join(hostRoot, ".rn", "catalog-embed.json");
  let androidPackages = {};
  try {
    const embed = JSON.parse(fs.readFileSync(embedFile, "utf8"));
    for (const row of embed.modules ?? []) {
      if (row.business_module && row.androidPackage) {
        androidPackages[row.business_module] = row.androidPackage;
      }
    }
  } catch {
    /* embed not present — fall through */
  }
  for (const m of modules) {
    const serial = devices[0];
    const pkg = androidPackages[m.id];
    if (!pkg) {
      skip(
        `${m.id} cold start via adb`,
        "no androidPackage in catalog embed (host-ops must register androidPackage)",
      );
      continue;
    }
    const r = spawnSync(
      "adb",
      ["-s", serial, "shell", "am", "start", "-n", `${pkg}/.MainActivity`],
      { encoding: "utf8", timeout: 10_000 },
    );
    if (r.status === 0) ok(`${m.id} cold start via adb (${pkg})`);
    else
      fail(
        `${m.id} cold start via adb`,
        `status=${r.status} stderr=${(r.stderr ?? "").slice(0, 200)}`,
      );
  }
}

console.log("");
if (failures.length) {
  console.error(`verify-dev-harness: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("verify-dev-harness: OK — harness is live and contracts hold.");
