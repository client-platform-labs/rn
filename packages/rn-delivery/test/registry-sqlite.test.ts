import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, before, after } from "node:test";

import {
  blockCandidateInRegistry,
  loadRegistry,
  promoteCandidateToStaging,
  saveRegistry,
} from "../dist/candidate-store.js";
import {
  loadRegistrySqlite,
  REGISTRY_SQLITE_FILE,
  saveRegistrySqlite,
} from "../dist/registry-sqlite.js";
import { buildCandidateMetadata, emptyDualSupplyChain } from "../dist/candidate.js";

describe("registry-sqlite", () => {
  let root: string;
  let prev: string | undefined;

  before(() => {
    root = mkdtempSync(path.join(tmpdir(), "rn-cp-sqlite-"));
    prev = process.env.RN_CP_REGISTRY;
    process.env.RN_CP_REGISTRY = "sqlite";
    writeFileSync(path.join(root, "package.json"), "{}");
  });

  after(() => {
    if (prev === undefined) delete process.env.RN_CP_REGISTRY;
    else process.env.RN_CP_REGISTRY = prev;
    rmSync(root, { recursive: true, force: true });
  });

  it("persists staging via saveRegistry", () => {
    const candidate = buildCandidateMetadata({
      release_id: "r1",
      artifact_kind: "app-host-debug",
      platform: "android",
      profile: "debug-host",
      digest: "a".repeat(64),
      path: "/tmp/x.apk",
      supply_chain: emptyDualSupplyChain(),
    });
    promoteCandidateToStaging(root, candidate);
    const sqlite = path.join(root, ".rn/delivery", REGISTRY_SQLITE_FILE);
    assert.equal(existsSync(sqlite), true);
    const loaded = loadRegistry(root);
    assert.equal(loaded.staging.length, 1);
    assert.equal(loaded.staging[0]?.digest, candidate.digest);
  });

  it("imports legacy registry.json once", () => {
    const legacy = mkdtempSync(path.join(tmpdir(), "rn-legacy-"));
    try {
      writeFileSync(path.join(legacy, "package.json"), "{}");
      const dir = path.join(legacy, ".rn/delivery");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, "registry.json"),
        JSON.stringify({
          schemaVersion: 1,
          staging: [],
          production: [],
          blocked: [
            {
              release_id: "r",
              digest: "b".repeat(64),
              platform: "android",
              reason: "legacy",
              blocked_at: "2026-08-26T00:00:00Z",
            },
          ],
        }),
      );
      process.env.RN_CP_REGISTRY = "sqlite";
      const loaded = loadRegistrySqlite(legacy);
      assert.equal(loaded.blocked.length, 1);
    } finally {
      rmSync(legacy, { recursive: true, force: true });
    }
  });

  it("block updates sqlite", () => {
    const blockRoot = mkdtempSync(path.join(tmpdir(), "rn-cp-block-"));
    try {
      writeFileSync(path.join(blockRoot, "package.json"), "{}");
      const candidate = buildCandidateMetadata({
        release_id: "r2",
        artifact_kind: "app-host-debug",
        platform: "android",
        profile: "debug-host",
        digest: "c".repeat(64),
        path: "/tmp/y.apk",
        supply_chain: emptyDualSupplyChain(),
      });
      promoteCandidateToStaging(blockRoot, candidate);
      blockCandidateInRegistry(blockRoot, candidate, "test block");
      const loaded = loadRegistry(blockRoot);
      assert.equal(loaded.staging.length, 0);
      assert.equal(loaded.blocked.length, 1);
    } finally {
      rmSync(blockRoot, { recursive: true, force: true });
    }
  });
});
