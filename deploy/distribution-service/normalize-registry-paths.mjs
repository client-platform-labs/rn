#!/usr/bin/env node
/**
 * Rewrite registry / sidecar absolute paths to RN_CP_PROJECT (Docker bind-mount).
 * Usage: node normalize-registry-paths.mjs [projectRoot]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || process.env.RN_CP_PROJECT || process.cwd());
const registryFile = path.join(root, ".rn/delivery/registry.json");
if (!existsSync(registryFile)) process.exit(0);

function normalize(p) {
  if (!p || typeof p !== "string") return p;
  if (existsSync(p)) return p;
  const markers = ["/tiangong-host/", "/code/tiangong-host/"];
  for (const m of markers) {
    const i = p.indexOf(m);
    if (i >= 0) {
      const candidate = path.join(root, p.slice(i + m.length));
      if (existsSync(candidate)) return candidate;
    }
  }
  if (p.startsWith(root)) return p;
  const base = path.basename(p);
  const guess = path.join(root, ".rn/delivery/updates", base);
  if (existsSync(guess)) return guess;
  return p;
}

const registry = JSON.parse(readFileSync(registryFile, "utf8"));
let changed = 0;
for (const lane of ["staging", "production", "blocked"]) {
  for (const row of registry[lane] || []) {
    for (const key of ["path", "sidecar_path"]) {
      if (!row[key]) continue;
      const next = normalize(row[key]);
      if (next !== row[key]) {
        row[key] = next;
        changed++;
      }
    }
  }
}
if (changed) {
  writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`normalize-registry-paths: fixed ${changed} path(s) under ${root}`);
}
