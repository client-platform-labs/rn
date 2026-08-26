#!/usr/bin/env node
/**
 * Apply brownfield host-profile + SurfaceHostAdapter stub (M3b branch).
 * Same delivery/dev-session scripts as GF — only Surface + profile differ.
 *
 * Usage:
 *   node scripts/apply-brownfield-host-stub.mjs [projectRoot]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const repoRoot = path.resolve(import.meta.dirname, "..");
const stubSrc = path.join(
  repoRoot,
  "examples/brownfield-host/android/src/main/java/com/clientplatform/rn/brownfield/SurfaceHostAdapter.kt",
);
const stubDest = path.join(
  projectRoot,
  "android/app/src/main/java/com/clientplatform/rn/brownfield/SurfaceHostAdapter.kt",
);
const hostProfile = path.join(projectRoot, ".rn/host-profile.jsonc");

if (!existsSync(path.join(projectRoot, "android"))) {
  console.error("FAIL: android/ missing — run from an rn init project");
  process.exit(1);
}
if (!existsSync(stubSrc)) {
  console.error(`FAIL: missing stub ${stubSrc}`);
  process.exit(1);
}

mkdirSync(path.dirname(stubDest), { recursive: true });
cpSync(stubSrc, stubDest);

mkdirSync(path.dirname(hostProfile), { recursive: true });
let topology = "shell-plus-modules";
if (existsSync(hostProfile)) {
  const raw = readFileSync(hostProfile, "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  try {
    const parsed = JSON.parse(raw);
    if (parsed.topology) topology = parsed.topology;
  } catch {
    /* keep default */
  }
}

writeFileSync(
  hostProfile,
  `// Brownfield branch (M3b) — same dev-session / delivery as GF
{
  "schemaVersion": 1,
  "profile": "brownfield",
  "topology": "${topology}",
  "devSessionProtocolVersion": 1,
  "notes": "SurfaceHostAdapter stub under android/; see examples/brownfield-host"
}
`,
);

console.error(`brownfield stub: ${path.relative(projectRoot, stubDest)}`);
console.error(`host-profile: profile=brownfield topology=${topology}`);
console.error("Next: rn doctor --profile brownfield");
console.error("Optional RCT host: node ../../scripts/scaffold-bf-rct-host.mjs .");
