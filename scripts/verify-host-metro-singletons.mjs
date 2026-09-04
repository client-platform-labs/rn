#!/usr/bin/env node
/**
 * Host Metro singleton policy verification (#158 / in-process ModuleRegistry).
 *
 * Ensures Debug Host does not resolve react from business node_modules
 * (Hooks crash: useState of null).
 *
 * Usage:
 *   node scripts/verify-host-metro-singletons.mjs [tiangong-host-path]
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rnRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const hostRoot =
  process.argv[2] ??
  process.env.TIANGONG_HOST_ROOT ??
  path.resolve(rnRoot, "../../../code/tiangong-host");

let auditHostMetroConfigOnDisk;
let writeHostMetroResolver;
try {
  ({ auditHostMetroConfigOnDisk, writeHostMetroResolver } = require(
    "../packages/rn/dist/metro-host-config.js",
  ));
} catch {
  console.error("FAIL  build packages/rn first: pnpm exec tsc -b packages/rn-core packages/rn");
  process.exit(1);
}

const failures = [];
function ok(label) {
  console.log(`PASS  ${label}`);
}
function fail(label, detail) {
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  failures.push(label);
}

console.log(`verify-host-metro-singletons: ${hostRoot}\n`);

try {
  writeHostMetroResolver(hostRoot);
  ok("writeHostMetroResolver");
} catch (err) {
  fail("writeHostMetroResolver", err instanceof Error ? err.message : String(err));
}

const issues = auditHostMetroConfigOnDisk(hostRoot);
if (issues.length === 0) {
  ok("auditHostMetroConfigOnDisk");
} else {
  for (const i of issues) fail("audit", i);
}

const metroConfig = path.join(hostRoot, "metro.config.js");
try {
  const { readFileSync, existsSync } = await import("node:fs");
  if (!existsSync(metroConfig)) {
    fail("metro.config.js exists");
  } else {
    const src = readFileSync(metroConfig, "utf8");
    if (src.includes("host-resolver.cjs")) {
      ok("metro.config.js delegates to host-resolver.cjs");
    } else {
      fail("metro.config.js must require .rn/metro/host-resolver.cjs");
    }
  }
} catch (err) {
  fail("metro.config.js read", String(err));
}

// Business metro must NOT pick up host singleton template
const deskMetro = path.resolve(hostRoot, "../desk/metro.config.js");
try {
  const { readFileSync, existsSync } = await import("node:fs");
  if (existsSync(deskMetro)) {
    const src = readFileSync(deskMetro, "utf8");
    if (!src.includes("host-resolver") && !src.includes("HOST_METRO_SINGLETON")) {
      ok("desk metro.config.js unchanged (business bundler independent)");
    } else {
      fail("desk metro must not use host singleton resolver");
    }
  } else {
    console.log("SKIP  desk metro.config.js");
  }
} catch {
  console.log("SKIP  desk metro check");
}

console.log("");
if (failures.length) {
  console.error(`verify-host-metro-singletons: FAIL (${failures.length})`);
  process.exit(1);
}
console.log("verify-host-metro-singletons: PASS");
