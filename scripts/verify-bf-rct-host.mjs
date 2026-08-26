#!/usr/bin/env node
/**
 * #5 — Brownfield RCT host verification (post scaffold-bf-rct-host).
 *
 * Usage:
 *   node scripts/verify-bf-rct-host.mjs <projectRoot>
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");

if (!process.argv[2]) {
  console.error("Usage: node scripts/verify-bf-rct-host.mjs <projectRoot>");
  process.exit(1);
}

const projectRoot = path.resolve(process.argv[2]);

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function findKotlinSync(name) {
  const root = path.join(projectRoot, "android/app/src/main/java");
  let found = null;
  function walk(dir) {
    if (found) return;
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === name) found = full;
    }
  }
  if (existsSync(root)) walk(root);
  return found;
}

console.log(`bf-rct-host verify: ${projectRoot}`);
console.log("");

const manifest = path.join(
  projectRoot,
  "android/app/src/main/AndroidManifest.xml",
);
const manifestBody = existsSync(manifest)
  ? readFileSync(manifest, "utf8")
  : "";

step("BrownfieldShellActivity in manifest", manifestBody.includes("BrownfieldShellActivity"));
step("RnSurfaceActivity in manifest", manifestBody.includes("RnSurfaceActivity"));
step(
  "shell is MAIN/LAUNCHER",
  /BrownfieldShellActivity[\s\S]*MAIN[\s\S]*LAUNCHER/.test(manifestBody),
);
step(
  "BrownfieldShellActivity.kt",
  Boolean(findKotlinSync("BrownfieldShellActivity.kt")),
);
step("RnSurfaceActivity.kt", Boolean(findKotlinSync("RnSurfaceActivity.kt")));
const surfacePath = findKotlinSync("RnSurfaceActivity.kt");
const surfaceBody = surfacePath ? readFileSync(surfacePath, "utf8") : "";
step(
  "bundlerUrl → PackagerConnectionSettings",
  surfaceBody.includes("PackagerConnectionSettings") &&
    surfaceBody.includes("EXTRA_BUNDLER_URL"),
);
step(
  "SurfaceHostAdapter.kt",
  Boolean(findKotlinSync("SurfaceHostAdapter.kt")),
);

const doctor = spawnSync(
  process.execPath,
  [
    path.join(repoRoot, "packages/rn/bin/rn.mjs"),
    "doctor",
    "--profile",
    "brownfield",
  ],
  { cwd: projectRoot, encoding: "utf8" },
);
const doctorOut = `${doctor.stdout ?? ""}\n${doctor.stderr ?? ""}`;
const bfChecksOk =
  doctorOut.includes("doctor: PASS") ||
  (doctorOut.includes("L3b") &&
    /bf-protocol-negotiate|bf-reference-host/.test(doctorOut) &&
    !/\[NEED\].*bf-/.test(doctorOut));
step(
  "rn doctor --profile brownfield",
  bfChecksOk,
  doctor.status === 0 ? "exit 0" : `exit ${doctor.status}`,
);

console.log("");
if (failed) {
  console.error("verify-bf-rct-host: FAIL");
  process.exit(1);
}
console.log("verify-bf-rct-host: PASS");
