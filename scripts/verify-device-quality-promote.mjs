#!/usr/bin/env node
/**
 * Repeatable Android device drill: a crash-loop on the device must block a
 * real `ship promote`.
 *
 * The device reports the signal. This script only harvests logcat, records
 * that signal, and requires promote to exit non-zero because of the quality
 * gate. It does not invent a signal, and it does not write an evidence file
 * unless a connected device produced a matching line and promote was rejected.
 *
 * `verify-quality-gate.mjs` records its own signal. That is not this drill.
 *
 * Usage:
 *   node scripts/verify-device-quality-promote.mjs <projectRoot>
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(process.argv[2] ?? "");

function fail(message) {
  console.error(`device-quality-promote: ${message}`);
  process.exit(2);
}

if (!process.argv[2]) {
  fail("usage: node scripts/verify-device-quality-promote.mjs <projectRoot>");
}

const devices = spawnSync("adb", ["devices", "-l"], { encoding: "utf8" });
if (devices.status !== 0) {
  fail(devices.stderr || "adb devices failed");
}
const serials = devices.stdout
  .split("\n")
  .slice(1)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("*"))
  .filter((line) => /\bdevice\b/.test(line))
  .map((line) => line.split(/\s+/)[0]);
if (serials.length === 0) {
  fail("no Android device attached — refusing to record a promote block");
}
if (serials.length > 1 && !process.env.ANDROID_SERIAL) {
  fail(`multiple devices (${serials.join(", ")}); set ANDROID_SERIAL`);
}
const serial = process.env.ANDROID_SERIAL || serials[0];

const logcat = spawnSync(
  "adb",
  ["-s", serial, "logcat", "-d", "-s", "OTA:E"],
  { encoding: "utf8" },
);
if (logcat.status !== 0) {
  fail(logcat.stderr || "adb logcat failed");
}

const { parseQualitySignalLine } = await import(
  pathToFileURL(path.join(repoRoot, "packages/core/dist/index.js")).href
);
const { loadRegistry } = await import(
  pathToFileURL(path.join(repoRoot, "packages/ship/dist/candidate-store.js")).href
);

const lines = logcat.stdout.split("\n").filter((line) => line.includes("quality-signal"));
const signal = [...lines].reverse().map(parseQualitySignalLine).find(Boolean);
if (!signal || signal.kind !== "crash") {
  fail(
    `device ${serial} has no crash quality-signal in logcat. ` +
      "Reproduce a crash-loop on a release build that logs quality-signal, then rerun.",
  );
}

const registry = loadRegistry(projectRoot);
const staging = registry.staging.find(
  (candidate) =>
    candidate.artifact_kind === "js-update" &&
    candidate.business_module === signal.business_module &&
    candidate.update_id === signal.update_id,
);
if (!staging) {
  fail(
    `device crash update_id=${signal.update_id} module=${signal.business_module} ` +
      "does not match a staging js-update — refusing to synthesize a candidate",
  );
}

const ship = path.join(repoRoot, "packages/ship/bin/ship.mjs");
const record = spawnSync(
  process.execPath,
  [
    ship,
    "signal",
    "record",
    "--module",
    signal.business_module,
    "--update-id",
    signal.update_id,
    "--kind",
    "crash",
    "--digest",
    staging.digest,
    "--detail",
    `device ${serial} crash-loop`,
  ],
  { cwd: projectRoot, encoding: "utf8" },
);
if (record.status !== 0) {
  fail(record.stderr || record.stdout || "signal record failed");
}

const promote = spawnSync(
  process.execPath,
  [ship, "promote", "--digest", staging.digest],
  { cwd: projectRoot, encoding: "utf8" },
);
const promoteOutput = `${promote.stdout ?? ""}\n${promote.stderr ?? ""}`;
if (promote.status === 0 || !promoteOutput.includes("quality gate")) {
  fail(
    `promote was not rejected by the quality gate (exit ${promote.status}): ${promoteOutput}`,
  );
}

const evidenceDir = path.join(repoRoot, "evidence/device-quality-promote");
mkdirSync(evidenceDir, { recursive: true });
const evidencePath = path.join(
  evidenceDir,
  `${serial}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
const evidence = {
  ok: true,
  serial,
  signal: {
    kind: signal.kind,
    business_module: signal.business_module,
    update_id: signal.update_id,
  },
  digest: staging.digest,
  promoteExit: promote.status,
  promoteOutput: promoteOutput.trim(),
  recordedAt: new Date().toISOString(),
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`[OK] device ${serial} crash blocked promote ${staging.digest}`);
console.log(evidencePath);
