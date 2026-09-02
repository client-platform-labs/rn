#!/usr/bin/env node
/**
 * Map E #105 — host install portal: candidates download_url + GET /v1/artifacts/:digest.
 *
 * Usage:
 *   node scripts/verify-cp-host-install-portal.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-e-host-portal-"));
mkdirSync(path.join(projectRoot, ".rn/delivery"), { recursive: true });
writeFileSync(
  path.join(projectRoot, "package.json"),
  JSON.stringify({ name: "e-host-portal" }),
);

const digest = "a".repeat(64);
const fakeApk = path.join(projectRoot, "fake-debug.apk");
writeFileSync(fakeApk, "PK\x03\x04fake-apk-body");
writeFileSync(
  path.join(projectRoot, ".rn/delivery/registry.json"),
  JSON.stringify({
    schemaVersion: 1,
    staging: [
      {
        release_id: "rel-host-1",
        artifact_kind: "app-host-debug",
        platform: "android",
        profile: "debug-host",
        digest,
        stage: "promote",
        path: fakeApk,
        configuration: "debug",
      },
    ],
    production: [],
    blocked: [],
    kills: [],
    pauses: [],
    rollouts: [],
  }),
);

const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");
const port = 18800 + Math.floor(Math.random() * 200);
const proc = spawn(
  process.execPath,
  [rd, "serve", "--port", String(port), "--host", "127.0.0.1"],
  {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

await new Promise((r) => setTimeout(r, 900));

try {
  const candRes = await fetch(
    `http://127.0.0.1:${port}/v1/candidates?lane=staging`,
  );
  const candJson = await candRes.json();
  if (
    candRes.status !== 200 ||
    !candJson.candidates?.[0]?.download_url?.includes(digest)
  ) {
    console.error("candidates download_url fail", candJson);
    process.exit(1);
  }
  console.log("OK candidates include download_url");

  const artRes = await fetch(
    `http://127.0.0.1:${port}/v1/artifacts/${digest}`,
  );
  const bytes = Buffer.from(await artRes.arrayBuffer());
  if (
    artRes.status !== 200 ||
    !bytes.toString("utf8").includes("fake-apk-body")
  ) {
    console.error("artifact download fail", artRes.status, bytes.toString());
    process.exit(1);
  }
  console.log("OK GET /v1/artifacts/:digest streams APK");

  const miss = await fetch(`http://127.0.0.1:${port}/v1/artifacts/${"b".repeat(64)}`);
  if (miss.status !== 404) {
    console.error("expected 404 for missing digest", miss.status);
    process.exit(1);
  }
  console.log("OK missing digest 404");

  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  if (!html.includes("宿主装包台") || !html.includes("host-builds")) {
    console.error("console missing host builds section");
    process.exit(1);
  }
  console.log("OK console Host builds section");

  console.log("verify-cp-host-install-portal: PASS");
} finally {
  proc.kill("SIGTERM");
}
