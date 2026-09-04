#!/usr/bin/env node
/**
 * Panel SoT verification — map #149 / #155.
 *
 * Asserts the CP catalog embed (e.g. `<host>/.rn/catalog-embed.json`)
 * is the SoT for the Debug Host Dev Session panel module list.
 * Compares its `business_module` ids and shape against the legacy
 * in-process ModuleRegistry (now deprecated).
 *
 * Exit codes:
 *   0 = PASS (catalog embed has >=2 modules, ids match legacy shape)
 *   1 = FAIL (embed missing or shape broken)
 *   2 = SKIP (host dir not found — non-blocker for AFK; run after host install)
 *
 * Usage:
 *   node scripts/verify-panel-sot.mjs
 *   HOST_ROOT=/path/to/host node scripts/verify-panel-sot.mjs
 *   LEGACY_REGISTRY_JSON='{"modules":[{"business_module":"desk"},{"business_module":"fixture_second"}]}' node scripts/verify-panel-sot.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rnRoot = path.resolve(__dirname, "..");

const failures = [];
function ok(label) {
  console.log(`[OK]   ${label}`);
}
function fail(label, detail) {
  console.error(`[FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
  failures.push(label);
}
function warn(label, detail) {
  console.warn(`[WARN] ${label}${detail ? ` — ${detail}` : ""}`);
}

const hostRoot =
  process.env.HOST_ROOT ?? "/Users/xuwei/code/tiangong-host";
const embedPath = path.join(hostRoot, ".rn", "catalog-embed.json");

if (!fs.existsSync(hostRoot)) {
  console.log(`[SKIP] host root not found: ${hostRoot} — run after Debug Host install`);
  process.exit(2);
}

if (!fs.existsSync(embedPath)) {
  fail("catalog embed exists", embedPath);
  console.error("\nverify-panel-sot: FAIL (no embed — Panel would fall back to legacy ModuleRegistry)");
  process.exit(1);
}
ok(`catalog embed present (${embedPath})`);

let embed;
try {
  embed = JSON.parse(fs.readFileSync(embedPath, "utf8"));
} catch (e) {
  fail("catalog embed parses", e instanceof Error ? e.message : String(e));
  process.exit(1);
}

if (typeof embed?.schemaVersion !== "number") {
  fail("catalog embed schemaVersion", String(embed?.schemaVersion));
}
if (typeof embed?.catalogRevision !== "number") {
  fail("catalog embed catalogRevision", String(embed?.catalogRevision));
}

const modules = Array.isArray(embed?.modules) ? embed.modules : [];
if (modules.length < 2) {
  fail("catalog embed modules >= 2", String(modules.length));
}
const embedIds = modules.map((m) => m.business_module).filter(Boolean);
if (!embedIds.includes("desk") || !embedIds.includes("fixture_second")) {
  fail(
    "catalog embed lists desk + fixture_second",
    JSON.stringify(embedIds),
  );
} else {
  ok(`catalog embed modules: ${embedIds.join(",")}`);
}

// Each module row must carry the legacy ModuleRegistry.list() shape parity.
const requiredKeys = ["business_module", "preferredMetroPort", "entry"];
for (const m of modules) {
  const missing = requiredKeys.filter((k) => !(k in m));
  if (missing.length) {
    fail(`module ${m.business_module ?? "?"} shape parity`, `missing: ${missing.join(",")}`);
  } else {
    ok(`module ${m.business_module} shape parity (business_module/preferredMetroPort/entry)`);
  }
}

// Optional parity vs legacy ModuleRegistry.list() JSON — for AFK loop.
// Defaults to the same shape the legacy list() returned; override via env.
const legacyEnv = process.env.LEGACY_REGISTRY_JSON;
let legacyIds = [];
if (legacyEnv) {
  try {
    const legacy = JSON.parse(legacyEnv);
    legacyIds = (legacy.modules ?? []).map((m) => m.business_module).filter(Boolean);
  } catch (e) {
    warn("legacy ModuleRegistry JSON parse", e instanceof Error ? e.message : String(e));
  }
}
if (legacyIds.length) {
  const missing = legacyIds.filter((id) => !embedIds.includes(id));
  if (missing.length) {
    fail("catalog embed covers legacy ModuleRegistry ids", `missing: ${missing.join(",")}`);
  } else {
    ok(`catalog embed supersedes legacy ModuleRegistry ids (${legacyIds.join(",")})`);
  }
} else {
  warn(
    "legacy ModuleRegistry parity",
    "no LEGACY_REGISTRY_JSON — set env to assert parity",
  );
}

// Fallback warning: if embed exists but modules array is empty, Panel would
// fall back to legacy ModuleRegistry — that is the deprecated path #155 retires.
if (modules.length === 0) {
  warn(
    "panel fallback path",
    "embed has zero modules — Panel would render legacy ModuleRegistry (deprecated)",
  );
}

console.log("");
if (failures.length) {
  console.error(`verify-panel-sot: ${failures.length} failure(s)`);
  console.error("Panel SoT = catalog embed. See LEGACY_MODULE_REGISTRY_NOTICE in packages/rn-core/src/metro-singletons.ts.");
  process.exit(1);
}
console.log("verify-panel-sot: OK — Panel reads from catalog embed (CP registry as SoT).");
