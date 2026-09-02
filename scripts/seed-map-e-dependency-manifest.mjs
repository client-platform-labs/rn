#!/usr/bin/env node
/**
 * Seed dependency-manifest from tiangong registry + PUT to running CP.
 *
 * Usage:
 *   node scripts/seed-map-e-dependency-manifest.mjs [tiangong-host-path]
 *
 * Env:
 *   RN_CP_BASE_URL  default http://127.0.0.1:4040
 *   RN_CP_TOKEN     default dev
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const hostRoot =
  process.argv[2] ||
  process.env.TIANGONG_HOST ||
  path.join(homedir(), "code/tiangong-host");
const base = process.env.RN_CP_BASE_URL || "http://127.0.0.1:4040";
const token = process.env.RN_CP_TOKEN || "dev";
const registryPath = path.join(hostRoot, ".rn/delivery/registry.json");
const manifestPath = path.join(hostRoot, ".rn/delivery/dependency-manifest.json");

if (!existsSync(registryPath)) {
  console.error(`missing registry: ${registryPath}`);
  process.exit(1);
}

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const jsRows = [...(registry.staging || []), ...(registry.production || [])].filter(
  (r) => r.artifact_kind === "js-update" && r.update_id,
);

const desk = jsRows.find((r) => r.business_module === "desk") || jsRows[0];
if (!desk) {
  console.error("no js-update in registry — run steel thread first");
  process.exit(1);
}

const manifest = {
  schemaVersion: 1,
  dependencies: [
    {
      from_update_id: desk.update_id,
      from_module: desk.business_module,
      strength: "soft",
      kind: "hint",
      reason: "Map E seed — portal relation view (soft, does not block promote)",
    },
  ],
  version_labels: {
    [desk.update_id]: "0.87.0",
  },
  host_capability_set: [],
  require_declared: false,
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`OK wrote ${manifestPath}`);

const res = await fetch(`${base}/v1/dependency-manifest`, {
  method: "PUT",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(manifest),
});

if (!res.ok) {
  const err = await res.text();
  console.error(`PUT ${base}/v1/dependency-manifest failed: ${res.status} ${err}`);
  process.exit(1);
}

const get = await fetch(`${base}/v1/dependency-manifest`);
const body = await get.json();
console.log(
  `OK PUT → CP (${body.dependencies?.length ?? 0} edges, labels=${Object.keys(body.version_labels || {}).length})`,
);
console.log("seed-map-e-dependency-manifest: PASS");
