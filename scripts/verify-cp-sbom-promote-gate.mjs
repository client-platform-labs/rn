#!/usr/bin/env node
/**
 * Map C C7 — P9 dual SBOM fail-closed on promote (self-contained).
 *
 * Usage:
 *   node scripts/verify-cp-sbom-promote-gate.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-c7-sbom-"));
const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "c7-sbom" }));

const digest = "d".repeat(64);

function jsUpdateCandidate(supply_chain) {
  return {
    digest,
    release_id: "rel-sbom",
    update_id: "main-sbom-1",
    business_module: "main",
    platform: "js",
    artifact_kind: "js-update",
    profile: "release",
    stage: "promote",
    path: null,
    supply_chain,
  };
}

function writeRegistry(candidate) {
  writeFileSync(
    path.join(projectRoot, ".rn/delivery/registry.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        staging: [candidate],
        production: [],
        blocked: [],
        kills: [],
        pauses: [],
        rollouts: [],
      },
      null,
      2,
    ),
  );
}

function run(args) {
  return spawnSync(process.execPath, [rd, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

function step(name, ok, detail) {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
}

const { evaluateSbomPromoteGate } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-core/dist/sbom-promote-gate.js"),
  ).href
);

writeRegistry(jsUpdateCandidate(undefined));
const missingGate = evaluateSbomPromoteGate({
  artifact_kind: "js-update",
  supply_chain: undefined,
});
step("gate blocks missing supply_chain", !missingGate.ok, missingGate.reason);

writeRegistry(jsUpdateCandidate({ host: {}, js_update: {} }));
run(["signal", "clear"]);
const promoteMissing = run(["promote", "--digest", digest]);
step(
  "promote blocked without SBOM",
  promoteMissing.status !== 0,
  promoteMissing.stderr || promoteMissing.stdout,
);

const hostReuse = evaluateSbomPromoteGate({
  artifact_kind: "app-host",
  supply_chain: {
    host: {
      sbom: {
        artifact_kind: "js-update",
        format: "stub",
        digest,
      },
    },
    js_update: {},
  },
});
step(
  "gate blocks host train reusing js-update SBOM kind",
  !hostReuse.ok,
  hostReuse.reason,
);

writeRegistry(
  jsUpdateCandidate({
    host: {},
    js_update: {
      sbom: {
        artifact_kind: "js-update",
        format: "stub",
        digest,
      },
    },
  }),
);
run(["signal", "clear"]);
const promoteOk = run(["promote", "--digest", digest]);
step(
  "promote succeeds with js_update stub SBOM",
  promoteOk.status === 0,
  promoteOk.stderr || promoteOk.stdout,
);

console.log("PASS verify-cp-sbom-promote-gate");
