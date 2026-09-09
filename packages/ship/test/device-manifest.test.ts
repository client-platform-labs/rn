import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildDeviceJsUpdateManifest, resolveSidecarFile } from "../dist/device-manifest.js";
import type { CandidateMetadata } from "../dist/types.js";

function tmpProject(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), "cp-serve-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function writeSidecar(root: string, digest: string): string {
  const dir = path.join(root, ".rn/delivery/updates/main");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `main-${digest.slice(0, 12)}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      business_module: "main",
      update_id: `main-${digest.slice(0, 12)}`,
      digest,
      signature: `pem:ed25519:${digest}`,
      release_id: "release-1",
      artifact_kind: "js-update",
      candidate: {
        business_module: "main",
        update_id: `main-${digest.slice(0, 12)}`,
        runtime_fingerprint: {
          rnExactTuple: "0.87.0",
          nativeAbiSurfaceDigest: "pending",
        },
        channel: "default",
      },
      host_context: { artifact_line: "pure-rn-greenfield" },
    }),
    "utf8",
  );
  return file;
}

describe("device-manifest sidecar resolution (deploy portability)", () => {
  it("reads a sidecar via an absolute path recorded by the build host", () => {
    const { root, cleanup } = tmpProject();
    try {
      const real = writeSidecar(root, "a".repeat(64));
      const meta = {
        digest: "a".repeat(64),
        sidecar_path: real,
      } as unknown as CandidateMetadata;
      const manifest = buildDeviceJsUpdateManifest(meta, { projectRoot: root });
      assert.ok(manifest);
      assert.equal(manifest!.update_id, `main-${"a".repeat(12)}`);
      assert.equal(manifest!.signature, `pem:ed25519:${"a".repeat(64)}`);
    } finally {
      cleanup();
    }
  });

  it("re-anchors a stale build-host absolute path under the serving project root", () => {
    const { root, cleanup } = tmpProject();
    try {
      // Sidecar exists under the serving root …
      writeSidecar(root, "b".repeat(64));
      // … but the registry records the build host's absolute path.
      const stale = "/Users/builder/app/.rn/delivery/updates/main/main-bbbbbbbbbbbb.json";
      const resolved = resolveSidecarFile(root, stale);
      assert.ok(resolved);
      assert.equal(path.dirname(resolved!), path.join(root, ".rn/delivery/updates/main"));
      const manifest = buildDeviceJsUpdateManifest(
        { digest: "b".repeat(64), sidecar_path: stale } as unknown as CandidateMetadata,
        { projectRoot: root },
      );
      assert.ok(manifest);
      assert.equal(manifest!.update_id, `main-${"b".repeat(12)}`);
      // bundle bytes served by digest, not by the stale path.
      assert.match(manifest!.url, /\/v1\/artifacts\/bbbb/);
    } finally {
      cleanup();
    }
  });

  it("returns null when neither the stored nor the re-anchored sidecar exists", () => {
    const { root, cleanup } = tmpProject();
    try {
      assert.equal(resolveSidecarFile(root, "/nope/.rn/delivery/updates/main/x.json"), null);
      assert.equal(
        buildDeviceJsUpdateManifest(
          { digest: "c".repeat(64), sidecar_path: "/nope/x.json" } as unknown as CandidateMetadata,
          { projectRoot: root },
        ),
        null,
      );
    } finally {
      cleanup();
    }
  });

  it("falls back to the stored path when it still exists (idempotent)", () => {
    const { root, cleanup } = tmpProject();
    try {
      const real = writeSidecar(root, "d".repeat(64));
      const resolved = resolveSidecarFile(root, real);
      assert.equal(resolved, real);
      // Round-trip through the built sidecar content.
      assert.ok(readFileSync(resolved!, "utf8").includes('"business_module":"main"'));
    } finally {
      cleanup();
    }
  });
});
