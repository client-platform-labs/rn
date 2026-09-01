import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCanPause,
  assertCanResume,
  collectBlockedUpdateIds,
  KillPauseError,
  normalizeKillInput,
} from "../dist/release-kill.js";

describe("release-kill", () => {
  it("collectBlockedUpdateIds merges kills and digest blocks", () => {
    const ids = collectBlockedUpdateIds({
      kills: [
        {
          business_module: "desk",
          update_ids: ["u1", "u2"],
          reason: "r",
          killed_at: "t",
          actor: "a",
        },
      ],
      blocked: [{ update_id: "u2" }, { update_id: "u3" }],
    });
    assert.deepEqual([...ids].sort(), ["u1", "u2", "u3"]);
  });

  it("normalizeKillInput rejects empty module / ids", () => {
    assert.throws(
      () => normalizeKillInput({ update_ids: ["a"] }),
      (e: unknown) => e instanceof KillPauseError && e.code === "missing_module",
    );
    assert.throws(
      () => normalizeKillInput({ business_module: "desk", update_ids: [] }),
      (e: unknown) =>
        e instanceof KillPauseError && e.code === "missing_update_ids",
    );
  });

  it("pause/resume transition guards", () => {
    assert.throws(
      () => assertCanResume([], "desk"),
      (e: unknown) => e instanceof KillPauseError && e.code === "not_paused",
    );
    const paused = [
      {
        business_module: "desk",
        reason: "r",
        paused_at: "t",
        actor: "a",
      },
    ];
    assert.throws(
      () => assertCanPause(paused, "desk"),
      (e: unknown) => e instanceof KillPauseError && e.code === "already_paused",
    );
    assertCanResume(paused, "desk");
  });
});
