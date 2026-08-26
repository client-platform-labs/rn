#!/usr/bin/env node
/**
 * Map B B4 — P4/P6 brownfield native doctor (AGP · Kotlin · NDK · ABI).
 *
 * Usage:
 *   node scripts/verify-bf-native-doctor.mjs [projectRoot]
 *
 * Default projectRoot: examples/brownfield-host
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(
  process.argv[2] ?? path.join(repoRoot, "examples/brownfield-host"),
);

const coreEntry = path.join(repoRoot, "packages/rn-core/dist/index.js");
const { defaultDualModuleDevSession } = await import(
  pathToFileURL(coreEntry).href
);
const { evaluateBrownfieldDoctor } = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn/dist/brownfield-doctor.js")).href
);

function resolveNode24() {
  const home = process.env.HOME ?? "";
  const candidates = [
    path.join(home, ".nvm/versions/node/v24.19.0/bin/node"),
    "/opt/homebrew/opt/node@24/bin/node",
  ];
  return candidates.find((p) => existsSync(p)) ?? process.execPath;
}

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

console.log(`verify-bf-native-doctor: ${projectRoot}`);
console.log("");

const session = defaultDualModuleDevSession();
const checks = evaluateBrownfieldDoctor({ projectRoot, session });
const required = ["bf-p4-agp", "bf-p4-kotlin", "bf-p4-rn-link", "bf-p6-abi"];
for (const id of required) {
  const check = checks.find((c) => c.id === id);
  step(id, check?.ok === true, check?.summary ?? "missing check");
}

const ndk = checks.find((c) => c.id === "bf-p4-ndk");
if (ndk?.ok) {
  step("bf-p4-ndk", true, ndk.summary);
} else {
  console.log(`[SKIP] bf-p4-ndk — ${ndk?.summary ?? "not run"}`);
}

const bfDoctor = spawnSync(
  resolveNode24(),
  [
    path.join(repoRoot, "packages/rn/bin/rn.mjs"),
    "doctor",
    "--profile",
    "brownfield",
  ],
  { cwd: projectRoot, encoding: "utf8" },
);
const out = `${bfDoctor.stdout ?? ""}\n${bfDoctor.stderr ?? ""}`;
step(
  "rn doctor --profile brownfield",
  out.includes("doctor: PASS"),
  bfDoctor.status === 0 ? "exit 0" : `exit ${bfDoctor.status}`,
);

console.log("");
if (failed) {
  console.error("verify-bf-native-doctor: FAIL");
  process.exit(1);
}
console.log("verify-bf-native-doctor: PASS");
