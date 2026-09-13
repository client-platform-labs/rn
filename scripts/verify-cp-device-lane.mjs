#!/usr/bin/env node
/**
 * C6.3 grey slicing + C6.4 audit log — device→lane routing on CP write routes.
 *
 * Migrated onto the verify fixture (#259). The audit assertions are the reason
 * this probe exists: a denied write must be RECORDED, and every line must be
 * structured — so the log is read back and validated entry by entry instead of
 * being assumed to exist.
 *
 * Usage:
 *   node scripts/verify-cp-device-lane.mjs
 *   node scripts/_run-verify.mjs cp-device-lane
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createHarness, emptyRegistry } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-cp-device-lane" });

await h.run(async () => {
  const p = h.project({
    name: "cp-device-lane",
    registry: {
      ...emptyRegistry(),
      staging: [
        {
          digest: "a".repeat(64),
          release_id: "r1",
          business_module: "desk",
          platform: "android",
          artifact_kind: "js-update",
          stage: "promote",
        },
      ],
    },
  });
  const cp = await h.serve({ project: p, role: "admin" });
  const auditPath = path.join(p.root, ".rn/distribution-lab/logs/cp-audit.log");
  const jsonHeaders = { "content-type": "application/json" };

  h.step("device→lane routing is bearer-gated");
  const denied = await cp.json("/v1/devices/ABC/lane", {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({ lane: "staging" }),
  });
  h.assertStatus(denied, 401, "a write without a token is rejected");

  const dflt = await cp.json("/v1/devices/ABC/lane");
  h.assertStatus(dflt, 200, "GET a device lane");
  h.assertEq(
    dflt.body.lane,
    "production",
    "an unassigned device falls back to production",
  );

  h.step("lane assignment round-trips");
  const set = await cp.json("/v1/devices/ABC/lane", {
    method: "PUT",
    headers: cp.auth,
    body: JSON.stringify({ lane: "gray" }),
  });
  h.assertStatus(set, 200, "PUT a device lane");
  h.assertEq(set.body.lane, "gray", "the write reports the new lane");

  const got = await cp.json("/v1/devices/ABC/lane");
  h.assertEq(got.body.lane, "gray", "the assignment is read back");

  const invalid = await cp.json("/v1/devices/ABC/lane", {
    method: "PUT",
    headers: cp.auth,
    body: JSON.stringify({ lane: "purple" }),
  });
  h.assertStatus(invalid, 400, "an unknown lane is rejected");

  h.step("the routing table is listed");
  const list = await cp.json("/v1/devices");
  h.assertStatus(list, 200, "GET /v1/devices");
  h.assertEq(list.body.devices?.ABC?.lane, "gray", "the table carries the assignment");

  h.step("gray-lane filtering is wired");
  const grayQ = await cp.json("/v1/js-updates?lane=gray&module=desk");
  h.assertStatus(grayQ, 200, "GET /v1/js-updates?lane=gray");
  h.assertTruthy(
    Array.isArray(grayQ.body.candidates),
    "an empty gray lane is a list, not an error",
  );

  h.step("the audit log records the denied and accepted writes");
  h.assertFileExists(auditPath, "cp-audit.log is written");
  const lines = readFileSync(auditPath, "utf8")
    .split("\n")
    .filter(Boolean);
  const malformed = lines.filter((line) => {
    try {
      const entry = JSON.parse(line);
      return !(entry.ts && entry.method && entry.path && entry.outcome);
    } catch {
      return true;
    }
  });
  h.assertEq(malformed.length, 0, "every audit line is structured JSON");
  h.assertTruthy(
    lines.length >= 3,
    `the log holds the denied and accepted writes (${lines.length} entries)`,
  );
  h.assertTruthy(
    lines.some((l) => l.includes('"denied"')) && lines.some((l) => l.includes('"ok"')),
    "both a denied and an accepted outcome are recorded",
  );
});
