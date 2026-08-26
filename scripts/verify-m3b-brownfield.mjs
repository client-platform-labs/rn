#!/usr/bin/env node
/**
 * M3b — Brownfield branch verification (same Spine scripts, BF profile).
 *
 * Usage:
 *   node scripts/verify-m3b-brownfield.mjs [projectRoot]
 *
 * projectRoot: rn init app with apply-brownfield-host-stub applied, OR omit for examples/brownfield-host doctor-only.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "examples/brownfield-host");

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

console.log(`m3b brownfield verify: ${projectRoot}`);
console.log("");

const bfDoctor = spawnSync(
  process.execPath,
  [
    path.join(repoRoot, "packages/rn/bin/rn.mjs"),
    "doctor",
    "--profile",
    "brownfield",
  ],
  { cwd: projectRoot, encoding: "utf8" },
);

const doctorOut = `${bfDoctor.stdout ?? ""}\n${bfDoctor.stderr ?? ""}`;
const l3bOk = /bf-protocol-negotiate|bf-reference-host/.test(doctorOut)
  ? !/\[NEED\].*bf-/.test(doctorOut) && bfDoctor.status === 0
  : bfDoctor.status === 0;

step(
  "rn doctor --profile brownfield",
  doctorOut.includes("doctor: PASS") || (doctorOut.includes("L3b") && l3bOk),
  bfDoctor.status === 0 ? "exit 0" : `exit ${bfDoctor.status}`,
);

if (process.argv[2]) {
  const steel = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts/verify-steel-thread.mjs"), projectRoot],
    { encoding: "utf8" },
  );
  step(
    "same steel-thread scripts (GF pipe)",
    steel.status === 0,
    steel.status === 0 ? "verify-steel-thread PASS" : "see above",
  );

  const jsLoad = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts/verify-js-update-load.mjs"), projectRoot],
    { encoding: "utf8" },
  );
  step(
    "same js-update load gate",
    jsLoad.status === 0 || jsLoad.stderr?.includes("no js-update"),
    jsLoad.status === 0 ? "production lane PASS" : "optional if no update yet",
  );
} else {
  console.log("[SKIP] full project — pass projectRoot after apply-brownfield-host-stub");
}

const coreEntry = path.resolve(repoRoot, "packages/rn-core/dist/index.js");
const { createBrownfieldReferenceHost } = await import(
  pathToFileURL(coreEntry).href
);
step(
  "createBrownfieldReferenceHost",
  typeof createBrownfieldReferenceHost === "function",
);

const bfGradle = spawnSync(
  process.execPath,
  [path.join(repoRoot, "scripts/verify-bf-gradle.mjs")],
  { encoding: "utf8" },
);
step(
  "verify-bf-gradle",
  bfGradle.status === 0,
  bfGradle.status === 0 ? "structure OK" : "see above",
);

console.log("");
if (failed) {
  console.error("m3b verify: FAIL");
  process.exit(1);
}
console.error("m3b verify: PASS");
