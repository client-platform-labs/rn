#!/usr/bin/env node
/**
 * C6.3 grey slicing + C6.4 audit log — device→lane routing on CP write routes.
 *
 * Usage:
 *   node scripts/verify-cp-device-lane.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-cp-device-lane-"));
const port = 19040 + Math.floor(Math.random() * 1000);
const token = "map-b-device-lane-token";
const bin = path.join(repoRoot, "packages/ship/bin/ship.mjs");

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "cp-device-lane-demo" }));
writeFileSync(
  path.join(projectRoot, ".rn/delivery/registry.json"),
  JSON.stringify({
    schemaVersion: 1,
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
    production: [],
    gray: [],
    devices: {},
    blocked: [],
    kills: [],
    pauses: [],
    rollouts: [],
  }),
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`OK ${msg}`);
}

const base = `http://127.0.0.1:${port}`;
const auth = {
  "content-type": "application/json",
  authorization: `Bearer ${token}`,
};

const auditPath = path.join(projectRoot, ".rn/distribution-lab/logs/cp-audit.log");

try {
  const admin = spawn(
    process.execPath,
    [bin, "serve", "--port", String(port), "--host", "127.0.0.1"],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, RN_CP_TOKEN: token, RN_CP_ROLE: "admin" },
    },
  );
  await sleep(700);

  // 1. no token PUT → 401 + denied audit
  const deny = await fetchJson(`${base}/v1/devices/ABC/lane`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lane: "staging" }),
  });
  if (deny.status !== 401) {
    fail(`no-token PUT should 401, got ${deny.status}`);
  } else {
    ok("no-token PUT /v1/devices → 401");
  }

  // 2. GET default lane → production (fallback)
  const dflt = await fetchJson(`${base}/v1/devices/ABC/lane`);
  if (dflt.status !== 200 || dflt.body.lane !== "production") {
    fail(`default lane should be production, got ${dflt.status} ${JSON.stringify(dflt.body)}`);
  } else {
    ok("default device lane = production (fallback)");
  }

  // 3. PUT valid lane → ok + roundtrip
  const set = await fetchJson(`${base}/v1/devices/ABC/lane`, {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ lane: "gray" }),
  });
  if (set.status !== 200 || set.body.lane !== "gray") {
    fail(`PUT gray failed ${set.status} ${JSON.stringify(set.body)}`);
  } else {
    ok("PUT device → gray");
  }

  const got = await fetchJson(`${base}/v1/devices/ABC/lane`);
  if (got.status !== 200 || got.body.lane !== "gray") {
    fail(`roundtrip lane should be gray, got ${JSON.stringify(got.body)}`);
  } else {
    ok("roundtrip: device lane = gray");
  }

  // 4. PUT invalid lane → 400
  const bad = await fetchJson(`${base}/v1/devices/ABC/lane`, {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ lane: "purple" }),
  });
  if (bad.status !== 400) {
    fail(`invalid lane should 400, got ${bad.status}`);
  } else {
    ok("PUT invalid lane → 400");
  }

  // 5. GET /v1/devices lists routing table
  const list = await fetchJson(`${base}/v1/devices`);
  if (list.status !== 200 || list.body.devices?.ABC?.lane !== "gray") {
    fail(`/v1/devices list should contain ABC=gray, got ${JSON.stringify(list.body)}`);
  } else {
    ok("/v1/devices lists device routing table");
  }

  // 6. gray lane filtering is wired (empty gray → 0 candidates, not error)
  const grayQ = await fetchJson(`${base}/v1/js-updates?lane=gray&module=desk`);
  if (grayQ.status !== 200 || !Array.isArray(grayQ.body.candidates)) {
    fail(`gray lane query should 200 array, got ${grayQ.status} ${JSON.stringify(grayQ.body)}`);
  } else {
    ok(`gray lane query → ${grayQ.body.candidates.length} candidates (empty gray) `);
  }

  // 7. audit log is structured
  const hasAudit = existsSync(auditPath);
  if (!hasAudit) {
    fail("cp-audit.log not written");
  } else {
    const lines = readFileSync(auditPath, "utf8").split("\n").filter(Boolean);
    const malformed = lines.filter((l) => {
      try {
        const o = JSON.parse(l);
        return !(o.ts && o.method && o.path && o.outcome);
      } catch {
        return true;
      }
    });
    if (malformed.length > 0) {
      fail(`audit log has malformed lines: ${malformed.length}`);
    } else if (lines.length < 3) {
      fail(`audit log should have ≥3 entries, got ${lines.length}`);
    } else {
      ok(`audit log structured (${lines.length} entries incl denied + ok)`);
    }
  }

  admin.kill("SIGTERM");
} finally {
  // best-effort cleanup
}

if (failed) {
  console.error("verify-cp-device-lane: FAIL");
  process.exit(1);
}
console.log("verify-cp-device-lane: PASS");