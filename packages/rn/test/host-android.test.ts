import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveHostAndroidScript } from "../dist/commands/host-android.js";
import { runningRepoRoot } from "../dist/install-home.js";

describe("resolveHostAndroidScript", () => {
  it("points at scripts/setup-host-android.sh in the repo", () => {
    const script = resolveHostAndroidScript();
    assert.ok(script.endsWith("scripts/setup-host-android.sh"));
    assert.equal(existsSync(script), true);
    assert.equal(
      existsSync(`${runningRepoRoot()}/scripts/setup-host-android.sh`),
      true,
    );
  });
});

describe("setup-host-android.sh dry-run", () => {
  it("prints install guide or ready summary", () => {
    const script = resolveHostAndroidScript();
    const r = spawnSync("bash", [script, "--dry-run"], { encoding: "utf8" });
    const out = `${r.stdout}\n${r.stderr}`;
    assert.equal(r.status, 0, out);
    assert.ok(
      /one-click install/i.test(out) || /already ready/i.test(out),
      out,
    );
    assert.match(out, /verify/i);
  });
});
