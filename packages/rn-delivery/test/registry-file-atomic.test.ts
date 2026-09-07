import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, after } from "node:test";

import { loadRegistry, promoteCandidateToStaging, saveRegistry } from "../dist/candidate-store.js";
import { buildCandidateMetadata, emptyDualSupplyChain } from "../dist/candidate.js";

describe("registry file-mode atomic write (ADR-013)", () => {
  const roots: string[] = [];

  function makeRoot(): string {
    const root = mkdtempSync(path.join(tmpdir(), "rn-cp-file-"));
    writeFileSync(path.join(root, "package.json"), "{}");
    roots.push(root);
    return root;
  }

  after(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
  });

  it("file mode writes registry.json without leftover tmp files", () => {
    const prev = process.env.RN_CP_REGISTRY;
    delete process.env.RN_CP_REGISTRY; // explicit file mode
    try {
      const root = makeRoot();
      const candidate = buildCandidateMetadata({
        release_id: "r-atomic",
        artifact_kind: "app-host-debug",
        platform: "android",
        profile: "debug-host",
        digest: "d".repeat(64),
        path: "/tmp/z.apk",
        supply_chain: emptyDualSupplyChain(),
      });
      promoteCandidateToStaging(root, candidate);
      const dir = path.join(root, ".rn/delivery");
      const files = readdirSync(dir);
      assert.equal(files.includes("registry.json"), true);
      assert.equal(
        files.some((f) => f.endsWith(".tmp")),
        false,
        `tmp leftovers: ${files.join(",")}`,
      );
      const loaded = loadRegistry(root);
      assert.equal(loaded.staging.length, 1);
      assert.equal(loaded.staging[0]?.digest, candidate.digest);
    } finally {
      if (prev === undefined) delete process.env.RN_CP_REGISTRY;
      else process.env.RN_CP_REGISTRY = prev;
    }
  });

  it("saveRegistry writes valid JSON that round-trips", () => {
    const prev = process.env.RN_CP_REGISTRY;
    delete process.env.RN_CP_REGISTRY;
    try {
      const root = makeRoot();
      const registry = loadRegistry(root);
      registry.blocked.push({
        release_id: "r",
        digest: "e".repeat(64),
        platform: "android",
        reason: "atomic",
        blocked_at: "2026-09-06T00:00:00Z",
      });
      saveRegistry(root, registry);
      const raw = readFileSync(path.join(root, ".rn/delivery", "registry.json"), "utf8");
      const parsed = JSON.parse(raw);
      assert.equal(parsed.blocked.length, 1);
    } finally {
      if (prev === undefined) delete process.env.RN_CP_REGISTRY;
      else process.env.RN_CP_REGISTRY = prev;
    }
  });
});