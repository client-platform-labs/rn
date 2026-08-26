#!/usr/bin/env node
/**
 * M4 / #14 — Debug Host artifact line verification (ADR-002).
 *
 * Usage:
 *   node scripts/verify-debug-host.mjs [projectRoot]
 *
 * Without projectRoot: contract + schema checks only.
 * With projectRoot: also reads last rn-delivery build metadata if present.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : null;

let failed = false;
function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

console.log("m4 debug-host verify");
console.log("");

const deliveryEntry = path.join(repoRoot, "packages/rn-delivery/dist/index.js");
const {
  hostArtifactKindForProfile,
  validateCandidateMetadata,
  buildCandidateMetadata,
} = await import(pathToFileURL(deliveryEntry).href);

step(
  "hostArtifactKindForProfile(debug-host)",
  hostArtifactKindForProfile("debug-host") === "app-host-debug",
);
step(
  "hostArtifactKindForProfile(release)",
  hostArtifactKindForProfile("release") === "app-host",
);

const debugMeta = buildCandidateMetadata({
  release_id: "rel-debug",
  artifact_kind: "app-host-debug",
  platform: "android",
  profile: "debug-host",
  digest: "a".repeat(64),
  stage: "compile",
  configuration: "debug",
});
const debugValid = validateCandidateMetadata(debugMeta);
step("validate app-host-debug + debug-host profile", debugValid.ok);

const wrongKind = buildCandidateMetadata({
  ...debugMeta,
  artifact_kind: "app-host",
});
const wrongValid = validateCandidateMetadata(wrongKind);
step(
  "reject app-host on debug-host native profile",
  !wrongValid.ok,
  wrongValid.ok ? "" : wrongValid.errors.join("; "),
);

const schemaPath = path.join(
  repoRoot,
  "packages/rn-delivery/schemas/candidate-metadata.schema.json",
);
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
step(
  "schema includes app-host-debug",
  schema.properties.artifact_kind.enum.includes("app-host-debug"),
);

if (projectRoot) {
  const resultsPath = path.join(projectRoot, ".rn", "delivery", "build-results.json");
  if (existsSync(resultsPath)) {
    const results = JSON.parse(readFileSync(resultsPath, "utf8"));
    const androidDebug = results.find?.(
      (r) => r.profile === "debug-host" && r.platform === "android",
    );
    if (androidDebug) {
      step(
        "build-results debug-host artifact_kind",
        androidDebug.artifact_kind === "app-host-debug",
        androidDebug.artifact_kind,
      );
      if (androidDebug.digest && androidDebug.digest.length === 64) {
        step("debug-host digest sealed", true, androidDebug.digest.slice(0, 12) + "…");
      }
    } else {
      console.log("[SKIP] no android debug-host entry in build-results.json");
    }
  } else {
    console.log("[SKIP] no .rn/delivery/build-results.json — run rn-delivery build first");
  }
}

const guidePath = path.join(repoRoot, "docs/guides/debug-host.md");
step("debug-host guide present", existsSync(guidePath));

console.log("");
if (failed) {
  console.error("verify-debug-host: FAIL");
  process.exit(1);
}
console.log("verify-debug-host: PASS");
