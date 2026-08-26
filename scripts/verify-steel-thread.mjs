#!/usr/bin/env node
/**
 * Spine M3 — steel-thread acceptance helper (GF · single module).
 *
 * Automated checks (no device required):
 *   1. release source hygiene
 *   2. candidate metadata on disk after build (if present)
 *   3. validate + release staging registry round-trip (dry)
 *
 * Device HITL (when ANDROID_HOME + adb + built APK):
 *   rn-delivery release --install
 *
 * Usage:
 *   node scripts/verify-steel-thread.mjs [projectRoot]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const coreHygiene = path.resolve(
  import.meta.dirname,
  "../packages/rn-core/dist/release-hygiene.js",
);
const deliveryValidate = path.resolve(
  import.meta.dirname,
  "../packages/rn-delivery/dist/validate.js",
);
const deliveryStore = path.resolve(
  import.meta.dirname,
  "../packages/rn-delivery/dist/candidate-store.js",
);

const { evaluateReleaseSourceHygiene } = await import(
  pathToFileURL(coreHygiene).href
);
const { evaluateDeliveryValidate } = await import(
  pathToFileURL(deliveryValidate).href
);
const { readLastCandidate, loadRegistry } = await import(
  pathToFileURL(deliveryStore).href
);

let failed = false;

function step(name, ok, detail = "") {
  const tag = ok ? "OK" : "FAIL";
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

/** Prefer release app-host from registry when last-candidate is debug-host (M4 pollution). */
function pickReleaseCandidate() {
  const last = readLastCandidate(projectRoot);
  if (last?.profile === "release" && last.artifact_kind === "app-host") {
    return last;
  }
  const registry = loadRegistry(projectRoot);
  const fromProd = registry.production.find(
    (c) => c.artifact_kind === "app-host" && c.profile === "release",
  );
  if (fromProd) {
    console.log(
      `[info] last-candidate is ${last?.profile ?? "missing"} — using production app-host for M3`,
    );
    return fromProd;
  }
  const fromStaging = registry.staging.find(
    (c) => c.artifact_kind === "app-host" && c.profile === "release",
  );
  if (fromStaging) {
    console.log(
      `[info] last-candidate is ${last?.profile ?? "missing"} — using staging app-host for M3`,
    );
    return fromStaging;
  }
  return last;
}

console.log(`steel-thread verify: ${projectRoot}`);
console.log("");

for (const check of evaluateReleaseSourceHygiene(projectRoot)) {
  step(`hygiene:${check.id}`, check.ok || !check.blocking, check.summary);
}

const last = pickReleaseCandidate();
if (last) {
  const validation = evaluateDeliveryValidate({
    projectRoot,
    candidate: last,
  });
  for (const check of validation.checks) {
    step(`validate:${check.id}`, check.ok || !check.blocking, check.summary);
  }
  step("candidate-metadata", validation.ok, `${last.platform} · ${last.profile}`);
} else {
  console.log("[SKIP] no .rn/delivery/last-candidate.json — run build first");
}

const registryPath = path.join(projectRoot, ".rn/delivery/registry.json");
if (existsSync(registryPath)) {
  const registry = loadRegistry(projectRoot);
  const drillComplete =
    registry.staging.length > 0 || registry.blocked.length > 0;
  step(
    "cp-registry",
    drillComplete,
    `${registry.staging.length} staging · ${registry.blocked.length} blocked`,
  );
} else {
  console.log("[SKIP] no registry — run rn-delivery release after build");
}

const adbProbe = spawnSync("adb", ["devices"], { encoding: "utf8" });
const adbReady =
  adbProbe.status === 0 &&
  adbProbe.stdout.split("\n").some((line) => /\tdevice$/.test(line));
if (adbReady) {
  step("adb-device", true, "authorized device present");
} else {
  console.log(
    "[SKIP] adb-device — no authorized device (AUTO-HITL: release --install / H-dist-install)",
  );
}

console.log("");
console.log("Manual steel-thread (GF · HITL):");
console.log("  rn doctor");
console.log("  rn dev --android");
console.log(
  "  rn-delivery build --platform android --profile release",
);
console.log("  rn-delivery update --module main --profile release");
console.log("  rn-delivery sign && rn-delivery validate && rn-delivery release && rn-delivery promote");
console.log("  node scripts/verify-js-update-load.mjs .");
console.log("  rn-delivery block --reason 'rollback drill'");
console.log("");
console.log(
  "Evidence: archive .rn/delivery/{last-candidate,registry}.json + adb install log",
);

if (failed) {
  console.error("steel-thread verify: FAIL");
  process.exit(1);
}
console.error("steel-thread verify: PASS (automated gates)");
