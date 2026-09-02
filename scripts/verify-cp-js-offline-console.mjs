#!/usr/bin/env node
/**
 * Map E #106 — JS/offline train: GET /v1/js-updates + console section.
 *
 * Usage:
 *   node scripts/verify-cp-js-offline-console.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "rn-e-js-console-"));
mkdirSync(path.join(projectRoot, ".rn/delivery/updates/checkout"), {
  recursive: true,
});
writeFileSync(
  path.join(projectRoot, "package.json"),
  JSON.stringify({ name: "e-js-console" }),
);

const digest = "c".repeat(64);
const bundlePath = path.join(
  projectRoot,
  ".rn/delivery/updates/checkout/js-chk-p184.hbc",
);
writeFileSync(bundlePath, "fake-hbc");
writeFileSync(
  path.join(projectRoot, ".rn/delivery/registry.json"),
  JSON.stringify({
    schemaVersion: 1,
    staging: [
      {
        release_id: "rel-js-1",
        artifact_kind: "js-update",
        platform: "js",
        profile: "release",
        digest,
        stage: "promote",
        path: bundlePath,
        business_module: "checkout",
        update_id: "js-chk-p184",
      },
      {
        release_id: "rel-host-noise",
        artifact_kind: "app-host-debug",
        platform: "android",
        profile: "debug-host",
        digest: "d".repeat(64),
        stage: "promote",
        path: "/tmp/nope.apk",
        configuration: "debug",
      },
    ],
    production: [
      {
        release_id: "rel-js-prod",
        artifact_kind: "js-update",
        platform: "js",
        profile: "release",
        digest: "e".repeat(64),
        stage: "promote",
        path: bundlePath,
        business_module: "home",
        update_id: "js-home-p30",
      },
    ],
    blocked: [],
    kills: [],
    pauses: [],
    rollouts: [],
  }),
);

const rd = path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs");
const port = 18900 + Math.floor(Math.random() * 200);
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
  const all = await (
    await fetch(`http://127.0.0.1:${port}/v1/js-updates`)
  ).json();
  if (all.candidates?.length !== 2) {
    console.error("expected 2 js-updates", all);
    process.exit(1);
  }
  console.log("OK GET /v1/js-updates all");

  const staging = await (
    await fetch(`http://127.0.0.1:${port}/v1/js-updates?lane=staging`)
  ).json();
  if (
    staging.candidates?.length !== 1 ||
    staging.candidates[0].business_module !== "checkout"
  ) {
    console.error("staging filter fail", staging);
    process.exit(1);
  }
  console.log("OK lane=staging");

  const mod = await (
    await fetch(
      `http://127.0.0.1:${port}/v1/js-updates?lane=all&module=home`,
    )
  ).json();
  if (mod.candidates?.length !== 1 || mod.candidates[0].update_id !== "js-home-p30") {
    console.error("module filter fail", mod);
    process.exit(1);
  }
  console.log("OK module=home");

  const hosts = await (
    await fetch(`http://127.0.0.1:${port}/v1/candidates`)
  ).json();
  if (hosts.candidates?.some((c) => c.artifact_kind === "js-update")) {
    console.error("candidates must stay host-only", hosts);
    process.exit(1);
  }
  console.log("OK /v1/candidates remains host-only");

  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  if (!html.includes("JS / 离线包") || !html.includes("js-updates")) {
    console.error("console missing JS train section");
    process.exit(1);
  }
  console.log("OK console JS train section");

  console.log("verify-cp-js-offline-console: PASS");
} finally {
  proc.kill("SIGTERM");
}
