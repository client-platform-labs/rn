#!/usr/bin/env node
/**
 * Remote health check for ECS distribution service.
 */
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ecsHost = process.env.ECS_HOST || "47.93.214.189";
const ecsUser = process.env.ECS_USER || "root";
const ecsKey = process.env.ECS_SSH_KEY || path.join(homedir(), ".ssh/hermes-ecs");
const publicUrl = process.env.ECS_DIST_URL || `http://${ecsHost}:4040`;

async function check(url) {
  const res = await fetch(`${url}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  const svc = await fetch(`${url}/v1/service`);
  if (!svc.ok) throw new Error(`service ${svc.status}`);
  console.log(`OK ${url}`);
}

try {
  await check(publicUrl);
} catch (publicErr) {
  console.warn(`public ${publicUrl} failed: ${publicErr.message}`);
  const ssh = spawnSync(
    "ssh",
    [
      "-i",
      ecsKey,
      "-o",
      "StrictHostKeyChecking=accept-new",
      `${ecsUser}@${ecsHost}`,
      "curl -sf http://127.0.0.1:4040/health && curl -sf http://127.0.0.1:4040/v1/service | head -c 120",
    ],
    { encoding: "utf8" },
  );
  if (ssh.status !== 0) {
    console.error(ssh.stderr || ssh.stdout);
    process.exit(1);
  }
  console.log(`OK ssh localhost:4040 on ${ecsHost}`);
}

console.log("verify-distribution-ecs: PASS");
