import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  attemptFailover,
  copyNewArtifacts,
  takeSnapshot,
} from "./ha-failover.mjs";

const DIGEST = "abc123digest";

function seedActive(root) {
  const delivery = path.join(root, ".rn/delivery");
  const artifacts = path.join(delivery, "artifacts");
  mkdirSync(artifacts, { recursive: true });
  const dbFile = path.join(delivery, "registry.sqlite");
  const db = new DatabaseSync(dbFile);
  db.exec("CREATE TABLE registry_marker (id INTEGER)");
  db.exec("INSERT INTO registry_marker VALUES (7)");
  db.close();
  writeFileSync(path.join(artifacts, DIGEST), "artifact-bytes");
  return dbFile;
}

function readMarker(dbFile) {
  const db = new DatabaseSync(dbFile);
  try {
    const row = db.prepare("SELECT id FROM registry_marker").get();
    return row?.id;
  } finally {
    db.close();
  }
}

describe("same-region failover", () => {
  it("copies a fresh snapshot and only the missing digest, then binds after three failures plus a recheck", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "ha-failover-"));
    const active = path.join(root, "active");
    const standby = path.join(root, "standby");
    const snapshots = path.join(root, "snapshots");
    seedActive(active);
    const now = new Date("2026-10-16T15:10:00.000Z");
    takeSnapshot({ activeRoot: active, snapshotRoot: snapshots, now });
    const first = copyNewArtifacts(active, standby);
    const second = copyNewArtifacts(active, standby);
    assert.equal(first.copied, 1);
    assert.equal(second.copied, 0);
    assert.equal(readFileSync(path.join(standby, ".rn/delivery/artifacts", DIGEST), "utf8"), "artifact-bytes");

    let calls = 0;
    const result = await attemptFailover({
      probe: async () => {
        calls += 1;
        return false;
      },
      snapshotRoot: snapshots,
      standbyRoot: standby,
      now,
    });
    assert.equal(calls, 4);
    assert.equal(result.bound, true);
    assert.equal(readMarker(path.join(standby, ".rn/delivery/registry.sqlite")), 7);
    const bound = JSON.parse(readFileSync(path.join(standby, ".rn/delivery/ha-bound.json"), "utf8"));
    assert.equal(bound.role, "active");
    assert.equal(bound.start, "ship cp-serve");
    assert.ok(existsSync(path.join(standby, ".rn/delivery/artifacts", DIGEST)));
  });

  it("does not bind when a recheck sees the active ready", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "ha-failover-"));
    const active = path.join(root, "active");
    const standby = path.join(root, "standby");
    const snapshots = path.join(root, "snapshots");
    seedActive(active);
    const now = new Date("2026-10-16T15:10:00.000Z");
    takeSnapshot({ activeRoot: active, snapshotRoot: snapshots, now });
    let calls = 0;
    const result = await attemptFailover({
      probe: async () => {
        calls += 1;
        return calls === 4;
      },
      snapshotRoot: snapshots,
      standbyRoot: standby,
      now,
    });
    assert.equal(result.bound, false);
    assert.equal(result.reason, "recheck-ok");
    assert.equal(existsSync(path.join(standby, ".rn/delivery/ha-bound.json")), false);
  });

  it("does not bind a snapshot older than two minutes", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "ha-failover-"));
    const active = path.join(root, "active");
    const standby = path.join(root, "standby");
    const snapshots = path.join(root, "snapshots");
    seedActive(active);
    const taken = new Date("2026-10-16T15:00:00.000Z");
    takeSnapshot({ activeRoot: active, snapshotRoot: snapshots, now: taken });
    const result = await attemptFailover({
      probe: async () => false,
      snapshotRoot: snapshots,
      standbyRoot: standby,
      now: new Date(taken.getTime() + 2 * 60 * 1000 + 1),
    });
    assert.equal(result.bound, false);
    assert.equal(result.reason, "snapshot-stale");
  });
});
