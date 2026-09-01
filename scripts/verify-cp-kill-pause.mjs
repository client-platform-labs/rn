#!/usr/bin/env node
/**
 * Map B B9 — CP Kill/Pause by business_module + A5 exclude wire.
 *
 * Usage:
 *   node scripts/verify-cp-kill-pause.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-cp-kill-"));
const port = 17040 + Math.floor(Math.random() * 1000);
const token = "map-b-kill-token";
const bin = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");

mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "cp-kill-demo" }));
writeFileSync(
  path.join(projectRoot, ".rn/delivery/registry.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      staging: [],
      production: [
        {
          digest: "aaa111",
          release_id: "r-a",
          update_id: "desk-kill-me",
          business_module: "desk",
          platform: "android",
          artifact_kind: "js-update",
          stage: "promote",
        },
        {
          digest: "bbb222",
          release_id: "r-b",
          update_id: "fixture-ok",
          business_module: "fixture_second",
          platform: "android",
          artifact_kind: "js-update",
          stage: "promote",
        },
      ],
      blocked: [],
      kills: [],
      pauses: [],
    },
    null,
    2,
  ),
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function spawnServe(role) {
  return spawn(process.execPath, [bin, "serve", "--port", String(port), "--host", "127.0.0.1"], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RN_CP_TOKEN: token,
      RN_CP_ROLE: role,
    },
  });
}

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

const base = `http://127.0.0.1:${port}`;
const auth = {
  "content-type": "application/json",
  authorization: `Bearer ${token}`,
};

try {
  const admin = spawnServe("admin");
  await sleep(700);

  const html = await fetch(`${base}/`);
  const htmlText = await html.text();
  if (!htmlText.includes("Kill") || !htmlText.includes("Pause")) {
    fail("console HTML missing Kill/Pause controls");
  } else {
    console.log("OK console HTML has Kill/Pause");
  }

  const kill = await fetchJson(`${base}/v1/kill`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      business_module: "desk",
      update_ids: ["desk-kill-me"],
      reason: "b9 drill",
    }),
  });
  if (kill.status !== 200) fail(`kill ${kill.status} ${JSON.stringify(kill.body)}`);
  else if (!kill.body.kill?.update_ids?.includes("desk-kill-me")) {
    fail("kill response missing kill record");
  } else {
    console.log("OK POST /v1/kill desk");
  }

  const killsGet = await fetchJson(`${base}/v1/kills`);
  if (killsGet.status !== 200) fail(`GET kills ${killsGet.status}`);
  const deskKill = (killsGet.body.kills || []).find((k) => k.business_module === "desk");
  if (!deskKill?.update_ids?.includes("desk-kill-me")) fail("desk kill not listed");
  else console.log("OK GET /v1/kills lists desk");

  if ((killsGet.body.blocked_update_ids || []).includes("fixture-ok")) {
    fail("fixture_second update_id should not be blocked");
  } else {
    console.log("OK module isolation — fixture_second untouched");
  }

  // A5 wire via rn-core dist
  const { excludeSlotsByBlockedUpdates, collectBlockedUpdateIds } = await import(
    pathToFileURL(path.join(repoRoot, "packages/rn-core/dist/index.js")).href
  );
  const blockedIds = collectBlockedUpdateIds({ kills: killsGet.body.kills });
  const slotsA = {
    active: { update_id: "desk-kill-me" },
    previous: null,
    baseline: { update_id: "desk-baseline" },
  };
  const slotsB = {
    active: { update_id: "fixture-ok" },
    previous: null,
    baseline: { update_id: "fixture-baseline" },
  };
  const exA = excludeSlotsByBlockedUpdates(slotsA, blockedIds);
  const exB = excludeSlotsByBlockedUpdates(slotsB, blockedIds);
  if (!exA.has("active")) fail("A5 should exclude desk active");
  else console.log("OK A5 excludeSlots desk active");
  if (exB.has("active")) fail("A5 must not exclude fixture_second");
  else console.log("OK A5 fixture_second unaffected");

  const pause = await fetchJson(`${base}/v1/pause`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ business_module: "desk", reason: "soak" }),
  });
  if (pause.status !== 200) fail(`pause ${pause.status}`);
  else console.log("OK POST /v1/pause");

  const pauseAgain = await fetchJson(`${base}/v1/pause`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ business_module: "desk" }),
  });
  if (pauseAgain.status !== 400 || pauseAgain.body.code !== "already_paused") {
    fail(`double pause should 400 already_paused, got ${pauseAgain.status} ${pauseAgain.body.code}`);
  } else {
    console.log("OK illegal double pause → already_paused");
  }

  admin.kill("SIGTERM");
  await sleep(300);

  const viewer = spawnServe("viewer");
  await sleep(700);
  const viewerResume = await fetchJson(`${base}/v1/resume`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ business_module: "desk" }),
  });
  if (viewerResume.status !== 403) {
    fail(`viewer resume should 403, got ${viewerResume.status}`);
  } else {
    console.log("OK viewer POST /v1/resume → 403");
  }
  viewer.kill("SIGTERM");
  await sleep(300);

  const admin2 = spawnServe("admin");
  await sleep(700);
  const resume = await fetchJson(`${base}/v1/resume`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ business_module: "desk" }),
  });
  if (resume.status !== 200) fail(`admin resume ${resume.status}`);
  else console.log("OK admin POST /v1/resume");

  const resumeIllegal = await fetchJson(`${base}/v1/resume`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ business_module: "desk" }),
  });
  if (resumeIllegal.status !== 400 || resumeIllegal.body.code !== "not_paused") {
    fail(`resume when live should not_paused, got ${resumeIllegal.status}`);
  } else {
    console.log("OK resume when not paused → not_paused");
  }

  // persisted file registry
  const onDisk = JSON.parse(
    readFileSync(path.join(projectRoot, ".rn/delivery/registry.json"), "utf8"),
  );
  if (!onDisk.kills?.some((k) => k.business_module === "desk")) {
    fail("registry.json missing kill persist");
  } else {
    console.log("OK kill persisted to registry.json");
  }

  admin2.kill("SIGTERM");
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

if (failed) process.exit(1);
console.log("PASS verify-cp-kill-pause");
process.exit(0);
