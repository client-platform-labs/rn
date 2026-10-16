import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { emptyRegistry, saveRegistry } from "../dist/candidate-store.js";
import { deviceBucket } from "../dist/gray-bucket.js";
import { createControlPlane, type ControlPlaneHandle } from "../dist/serve.js";
import type { CandidateMetadata } from "../dist/types.js";

const OLD =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NEW =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function candidate(digest: string, updateId: string, sidecar: string): CandidateMetadata {
  return {
    schemaVersion: 1,
    release_id: "rel",
    artifact_kind: "js-update",
    platform: "js",
    profile: "release",
    digest,
    stage: "promote",
    lane: "production",
    business_module: "main",
    update_id: updateId,
    sidecar_path: sidecar,
  };
}

function writeSidecar(file: string, digest: string, updateId: string): void {
  writeFileSync(
    file,
    JSON.stringify({
      business_module: "main",
      update_id: updateId,
      digest,
      release_id: "rel",
      artifact_kind: "js-update",
      candidate: {
        business_module: "main",
        update_id: updateId,
        channel: "default",
        runtime_fingerprint: {
          engine: { id: "react-native", version: "0.87.0" },
          nativeAbiSurfaceDigest: "pending",
        },
        required_capabilities: [],
        target_artifact_lines: ["pure-rn-greenfield"],
        release_gate: "js-standard",
      },
      host_context: {
        artifact_line: "pure-rn-greenfield",
        runtime_fingerprint: {
          engine: { id: "react-native", version: "0.87.0" },
          nativeAbiSurfaceDigest: "pending",
        },
      },
    }),
  );
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const addr = probe.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

describe("device gray bucket", () => {
  it("keeps one device in one bucket and matches the percent across a population", () => {
    const digest = NEW;
    const percent = 10;
    const first = deviceBucket("device-a", digest);
    for (let i = 0; i < 20; i++) {
      assert.equal(deviceBucket("device-a", digest), first);
    }
    const ids = Array.from({ length: 1000 }, (_, i) => `device-${i}`);
    const covered = ids.filter((id) => deviceBucket(id, digest) < percent).length;
    assert.equal(covered, ids.filter((id) => deviceBucket(id, digest) < percent).length);
    assert.ok(covered > 70 && covered < 130, `expected ~10%, got ${covered}`);
  });

  it("check returns the bucket's digest and the log names that percent", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-gray-check-"));
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "demo" }));
    const oldSidecar = path.join(root, "old.json");
    const newSidecar = path.join(root, "new.json");
    writeSidecar(oldSidecar, OLD, "main-old");
    writeSidecar(newSidecar, NEW, "main-new");
    const registry = emptyRegistry();
    registry.production = [
      candidate(OLD, "main-old", oldSidecar),
      candidate(NEW, "main-new", newSidecar),
    ];
    registry.rollouts = [
      {
        business_module: "main",
        digest: NEW,
        update_id: "main-new",
        gate: "js-standard",
        steps: [{ cohort: "canary", percent: 10, min_soak_ms: 0 }],
        step_index: 0,
        phase: "canary",
        step_entered_at: new Date().toISOString(),
        actor: "test",
      },
    ];
    mkdirSync(path.join(root, ".rn", "delivery"), { recursive: true });
    saveRegistry(root, registry);

    let inside = "";
    let outside = "";
    for (let i = 0; i < 400 && (!inside || !outside); i++) {
      const id = `device-${i}`;
      if (deviceBucket(id, NEW) < 10) inside ||= id;
      else outside ||= id;
    }
    assert.ok(inside && outside);

    const lines: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const port = await freePort();
    let handle: ControlPlaneHandle | undefined;
    try {
      handle = createControlPlane({ cwd: root, port, host: "127.0.0.1" });
      await handle.listen();
      const check = async (device: string) => {
        const res = await fetch(
          `http://127.0.0.1:${port}/v1/js-updates/check?module=main&lane=production&device=${device}`,
        );
        assert.equal(res.status, 200);
        return (await res.json()) as { digest: string };
      };
      const first = await check(inside);
      const again = await check(inside);
      const other = await check(outside);
      const anon = await fetch(
        `http://127.0.0.1:${port}/v1/js-updates/check?module=main&lane=production`,
      );
      const anonBody = (await anon.json()) as { digest: string };
      assert.equal(first.digest, NEW);
      assert.equal(again.digest, NEW);
      assert.equal(other.digest, OLD);
      assert.equal(anonBody.digest, OLD);
      const gray = lines.filter((l) => l.includes("[cp] gray "));
      assert.ok(gray.length >= 4);
      for (const line of gray) {
        assert.match(line, /percent=10/);
      }
      assert.ok(gray.some((l) => l.includes(`device=${inside}`) && l.includes(`digest=${NEW}`)));
      assert.ok(gray.some((l) => l.includes(`device=${outside}`) && l.includes(`digest=${OLD}`)));
      assert.ok(gray.some((l) => l.includes("device=missing") && l.includes(`digest=${OLD}`)));
    } finally {
      console.error = orig;
      await handle?.close();
    }
  });
});
