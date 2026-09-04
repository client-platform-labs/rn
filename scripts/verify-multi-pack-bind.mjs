#!/usr/bin/env node
/**
 * Multi-pack Bind evidence harness (map #149 / #155).
 *
 * Checks what can be automated without a device UI robot:
 * - Catalog embed / resolve contract (desk + fixture_second)
 * - resolveBindMetroUrl USB vs Wi‑Fi rules
 * - fixture_second + desk host-surface entries exist
 * - Live broker optional (if BROKER_URL set)
 *
 * Device TRUE-HITL / adb Wi‑Fi Bind still required for map close.
 *
 * Usage:
 *   node scripts/verify-multi-pack-bind.mjs
 *   BROKER_URL=http://127.0.0.1:7420 node scripts/verify-multi-pack-bind.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rnRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const deskRoot = process.env.DESK_ROOT ?? path.resolve(rnRoot, "../../../code/desk");
const fixtureRoot =
  process.env.FIXTURE_SECOND_ROOT ??
  path.resolve(rnRoot, "../../../code/fixture_second");
const hostRoot =
  process.env.TIANGONG_HOST_ROOT ??
  path.resolve(rnRoot, "../../../code/tiangong-host");

const failures = [];

function ok(label) {
  console.log(`PASS  ${label}`);
}
function fail(label, detail) {
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  failures.push(label);
}

function mustExist(label, p) {
  if (fs.existsSync(p)) ok(label);
  else fail(label, p);
}

mustExist("desk host-surface", path.join(deskRoot, "entries/host-surface.js"));
mustExist(
  "fixture_second host-surface",
  path.join(fixtureRoot, "entries/host-surface.js"),
);
mustExist(
  "fixture_second module descriptor",
  path.join(fixtureRoot, "client-platform.module.jsonc"),
);
mustExist(
  "Host catalog embed",
  path.join(hostRoot, ".rn/catalog-embed.json"),
);
mustExist(
  "Host metro resolver (singleton React)",
  path.join(hostRoot, ".rn/metro/host-resolver.cjs"),
);

const embed = JSON.parse(
  fs.readFileSync(path.join(hostRoot, ".rn/catalog-embed.json"), "utf8"),
);
const ids = (embed.modules ?? []).map((m) => m.business_module);
if (ids.includes("desk") && ids.includes("fixture_second")) {
  ok("catalog embed lists desk + fixture_second");
} else {
  fail("catalog embed modules", JSON.stringify(ids));
}

// Prefer built dist; fall back to dynamic compile path
let resolveBindMetroUrl;
try {
  ({ resolveBindMetroUrl } = require("../packages/rn-core/dist/bind-transport.js"));
} catch {
  fail("rn-core bind-transport dist", "run: npm run build -w packages/rn-core");
}

if (resolveBindMetroUrl) {
  const usb = resolveBindMetroUrl({
    transport: "usb",
    usbUrl: "http://127.0.0.1:8081",
    lanUrl: "http://192.168.1.8:8081",
  });
  const wifi = resolveBindMetroUrl({
    transport: "wifi",
    lanUrl: "http://192.168.1.8:8081",
  });
  const wifiBad = resolveBindMetroUrl({
    transport: "wifi",
    lanUrl: "http://127.0.0.1:8081",
  });
  if (usb.ok && wifi.ok && !wifiBad.ok) ok("resolveBindMetroUrl USB+Wi‑Fi rules");
  else fail("resolveBindMetroUrl", JSON.stringify({ usb, wifi, wifiBad }));
}

let allocateMetroPort;
try {
  ({ allocateMetroPort } = require("../packages/rn/dist/metro-port-allocate.js"));
} catch {
  fail("rn metro-port-allocate dist", "run: pnpm exec tsc -b packages/rn");
}

if (allocateMetroPort) {
  const bumped = await allocateMetroPort({
    moduleId: "fixture_second",
    preferredPort: 8082,
    probe: async (port) => {
      if (port === 8082) return { running: true, moduleId: null };
      if (port === 8083) return { running: false, moduleId: null };
      return { running: true, moduleId: "other" };
    },
  });
  if (bumped.port === 8083 && bumped.bumped) ok("allocateMetroPort bumps foreign occupant");
  else fail("allocateMetroPort bump", JSON.stringify(bumped));
}

const broker = process.env.BROKER_URL;
if (broker) {
  try {
    const res = await fetch(`${broker.replace(/\/$/, "")}/v1/live`);
    if (!res.ok) fail("broker live HTTP", String(res.status));
    else {
      const body = await res.json();
      const live = Array.isArray(body.live) ? body.live : [];
      const liveIds = live.map((r) => r.moduleId);
      ok(`broker live reachable (${liveIds.join(",") || "empty"})`);
      for (const id of ["desk", "fixture_second"]) {
        const row = live.find((r) => r.moduleId === id);
        if (!row) {
          console.log(`SKIP  live ${id} (start npm run dev in both packs)`);
          continue;
        }
        if (row.usbUrl) ok(`live ${id} usbUrl`);
        else fail(`live ${id} usbUrl`);
        if (row.lanUrl && !/127\.0\.0\.1|localhost/i.test(row.lanUrl)) {
          ok(`live ${id} lanUrl`);
        } else {
          console.log(
            `WARN  live ${id} lanUrl missing/loopback — Wi‑Fi Bind will fail until lanUrl published`,
          );
        }
      }
    }
  } catch (e) {
    fail("broker live fetch", e instanceof Error ? e.message : String(e));
  }
} else {
  console.log("SKIP  broker live (set BROKER_URL to probe)");
}

console.log("");
if (failures.length) {
  console.error(`verify-multi-pack-bind: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("verify-multi-pack-bind: OK (file+contract layer)");
console.log(
  "Next: rebuild Debug Host; desk+fixture_second npm run dev; adb + Wi‑Fi Bind TRUE-HITL",
);
