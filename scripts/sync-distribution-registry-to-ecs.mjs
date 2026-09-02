#!/usr/bin/env node
/**
 * Sync tiangong-host .rn/delivery + artifacts to ECS distribution volume.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const hostRoot =
  process.env.TIANGONG_HOST || path.join(homedir(), "code/tiangong-host");
const ecsHost = process.env.ECS_HOST || "47.93.214.189";
const ecsUser = process.env.ECS_USER || "root";
const ecsKey = process.env.ECS_SSH_KEY || path.join(homedir(), ".ssh/hermes-ecs");
const ecsRepo = process.env.ECS_REPO || "/opt/rn";
const containerProject = "/data/project";

const registryPath = path.join(hostRoot, ".rn/delivery/registry.json");
if (!existsSync(registryPath)) {
  console.error(`missing registry: ${registryPath}`);
  process.exit(1);
}

const stagingDir = path.join(hostRoot, ".rn/ecs-sync-staging");
mkdirSync(stagingDir, { recursive: true });

function artifactName(row) {
  const ext = path.extname(row.path || "") || ".bin";
  return `${row.artifact_kind}-${row.digest.slice(0, 16)}${ext}`;
}

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const rows = [...(registry.staging || []), ...(registry.production || [])];

for (const row of rows) {
  if (row.path && existsSync(row.path)) {
    const name = artifactName(row);
    const dest = path.join(stagingDir, "artifacts", name);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(row.path, dest);
    row.path = `${containerProject}/artifacts/${name}`;
  }
  if (row.sidecar_path && existsSync(row.sidecar_path)) {
    const rel = path.join(
      "updates",
      row.business_module || "main",
      path.basename(row.sidecar_path),
    );
    const dest = path.join(stagingDir, ".rn/delivery", rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    const sidecar = JSON.parse(readFileSync(row.sidecar_path, "utf8"));
    if (row.path) sidecar.bundle_path = row.path;
    writeFileSync(dest, `${JSON.stringify(sidecar, null, 2)}\n`);
    row.sidecar_path = `${containerProject}/.rn/delivery/${rel.replace(/\\/g, "/")}`;
  }
}

mkdirSync(path.join(stagingDir, ".rn/delivery"), { recursive: true });
writeFileSync(
  path.join(stagingDir, ".rn/delivery/registry.json"),
  `${JSON.stringify(registry, null, 2)}\n`,
);
writeFileSync(
  path.join(stagingDir, "package.json"),
  `${JSON.stringify({ name: "tiangong-host-ecs" }, null, 2)}\n`,
);

const depSrc = path.join(hostRoot, ".rn/delivery/dependency-manifest.json");
if (existsSync(depSrc)) {
  copyFileSync(
    depSrc,
    path.join(stagingDir, ".rn/delivery/dependency-manifest.json"),
  );
}

const remoteStaging = "/tmp/rn-distribution-sync";
const rsync = spawnSync(
  "rsync",
  [
    "-az",
    "--delete",
    "-e",
    `ssh -i ${ecsKey} -o StrictHostKeyChecking=accept-new`,
    `${stagingDir}/`,
    `${ecsUser}@${ecsHost}:${remoteStaging}/`,
  ],
  { stdio: "inherit" },
);
if (rsync.status !== 0) process.exit(rsync.status ?? 1);

const remoteCmd = [
  "set -e",
  "VOL=$(docker volume inspect distribution-service_distribution-data -f '{{.Mountpoint}}' 2>/dev/null || true)",
  'if [ -z "$VOL" ]; then echo "run scripts/deploy-distribution-ecs.sh first"; exit 1; fi',
  `rsync -a ${remoteStaging}/ "$VOL/"`,
  `docker compose -f ${ecsRepo}/deploy/distribution-service/docker-compose.yml restart distribution || true`,
  "sleep 2",
  "curl -sf http://127.0.0.1:4040/health",
].join(" && ");

const remote = spawnSync(
  "ssh",
  ["-i", ecsKey, "-o", "StrictHostKeyChecking=accept-new", `${ecsUser}@${ecsHost}`, remoteCmd],
  { stdio: "inherit" },
);
if (remote.status !== 0) process.exit(remote.status ?? 1);
console.log("sync-distribution-registry-to-ecs: OK");
