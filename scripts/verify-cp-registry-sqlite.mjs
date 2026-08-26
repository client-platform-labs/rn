#!/usr/bin/env node
/**
 * Map B B3 — CP registry SQLite backend (RN_CP_REGISTRY=sqlite).
 *
 * Usage:
 *   node scripts/verify-cp-registry-sqlite.mjs
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const root = mkdtempSync(path.join(tmpdir(), "rn-cp-sqlite-verify-"));
process.env.RN_CP_REGISTRY = "sqlite";

writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "cp-sqlite" }));

const { promoteCandidateToStaging, loadRegistry, blockCandidateInRegistry } =
  await import(
    pathToFileURL(
      path.join(repoRoot, "packages/rn-delivery/dist/candidate-store.js"),
    ).href
  );
const { buildCandidateMetadata, emptyDualSupplyChain } = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn-delivery/dist/candidate.js"))
    .href
);
const { REGISTRY_SQLITE_FILE } = await import(
  pathToFileURL(
    path.join(repoRoot, "packages/rn-delivery/dist/registry-sqlite.js"),
  ).href
);

const digest = "d".repeat(64);
const candidate = buildCandidateMetadata({
  release_id: "verify-r",
  artifact_kind: "app-host-debug",
  platform: "android",
  profile: "debug-host",
  digest,
  path: "/tmp/verify.apk",
  supply_chain: emptyDualSupplyChain(),
});

promoteCandidateToStaging(root, candidate);
const sqlite = path.join(root, ".rn/delivery", REGISTRY_SQLITE_FILE);
if (!existsSync(sqlite)) {
  console.error("FAIL: registry.sqlite missing");
  process.exit(1);
}

const loaded = loadRegistry(root);
if (loaded.staging.length !== 1 || loaded.staging[0]?.digest !== digest) {
  console.error("FAIL: staging not loaded from sqlite", loaded);
  process.exit(1);
}

blockCandidateInRegistry(root, candidate, "verify block");
const after = loadRegistry(root);
if (after.staging.length !== 0 || after.blocked.length !== 1) {
  console.error("FAIL: block not persisted", after);
  process.exit(1);
}

rmSync(root, { recursive: true, force: true });
console.log("verify-cp-registry-sqlite: PASS");
