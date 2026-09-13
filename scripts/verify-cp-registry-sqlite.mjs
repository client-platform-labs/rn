#!/usr/bin/env node
/**
 * Map B B3 — CP registry SQLite backend (RN_CP_REGISTRY=sqlite).
 *
 * Migrated onto the verify fixture (#259). This probe drives the candidate
 * store DIRECTLY (no control-plane process), so the fixture's contribution is
 * the hermetic project + assertions + verdict — which is exactly the part that
 * was hand-rolled here.
 *
 * Usage:
 *   node scripts/verify-cp-registry-sqlite.mjs
 *   node scripts/_run-verify.mjs cp-registry-sqlite
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createHarness, REPO_ROOT } from "./lib/verify/fixture.mjs";

// The backend must be selected BEFORE candidate-store is loaded.
process.env.RN_CP_REGISTRY = "sqlite";

const { promoteCandidateToStaging, loadRegistry, blockCandidateInRegistry } =
  await import(
    pathToFileURL(path.join(REPO_ROOT, "packages/ship/dist/candidate-store.js"))
      .href
  );
const { buildCandidateMetadata, emptyDualSupplyChain } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/ship/dist/candidate.js")).href
);
const { REGISTRY_SQLITE_FILE } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/ship/dist/registry-sqlite.js"))
    .href
);

const h = createHarness({ name: "verify-cp-registry-sqlite" });

const DIGEST = "d".repeat(64);

await h.run(async () => {
  const p = h.project({ name: "cp-registry-sqlite" });
  // The fixture seeds a file registry for probes that read one; this probe
  // asserts the sqlite backend is chosen INSTEAD, so the file must not exist
  // (otherwise a fallback to the file adapter would look like a pass).
  rmSync(path.join(p.root, ".rn", "delivery", "registry.json"), { force: true });

  const candidate = buildCandidateMetadata({
    release_id: "verify-r",
    artifact_kind: "app-host-debug",
    platform: "android",
    profile: "debug-host",
    digest: DIGEST,
    path: "/tmp/verify.apk",
    supply_chain: emptyDualSupplyChain(),
  });

  h.step("RN_CP_REGISTRY=sqlite selects the sqlite backend");
  promoteCandidateToStaging(p.root, candidate);
  const sqliteFile = path.join(p.root, ".rn", "delivery", REGISTRY_SQLITE_FILE);
  h.assertFileExists(sqliteFile, "registry.sqlite is created");
  h.assertTruthy(
    !p.exists(".rn/delivery/registry.json"),
    "no file registry is written when sqlite is selected",
  );

  h.step("staging round-trips through sqlite");
  const loaded = loadRegistry(p.root);
  h.assertEq(loaded.staging.length, 1, "one staged candidate");
  h.assertEq(loaded.staging[0]?.digest, DIGEST, "the staged digest matches");

  h.step("block persists through sqlite");
  blockCandidateInRegistry(p.root, candidate, "verify block");
  const after = loadRegistry(p.root);
  h.assertEq(after.staging.length, 0, "staging is empty after the block");
  h.assertEq(after.blocked.length, 1, "the block is recorded");
});
