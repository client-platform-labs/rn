#!/usr/bin/env node
/**
 * Map D D4 — migration dry-run contract (expo/bare advisor).
 *
 * Usage:
 *   node scripts/verify-migration-dry-run.mjs
 */
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");

const core = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn-core/dist/migration-dry-run.js")).href
);
const { buildExpoMigrateDryRunReport } = await import(
  pathToFileURL(path.join(repoRoot, "packages/rn/dist/expo-migrate.js")).href
);

function step(name, ok, detail = "") {
  if (!ok) {
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
}

function digestFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const stub = core.buildBareBrownfieldAdvisorStub("brownfield", {
  hasAndroid: true,
});
step("bare/brownfield stub validates", core.validateMigrationDryRunReport(stub).ok);

const bad = core.validateMigrationDryRunReport({ source: "expo", dryRun: true });
step(
  "reject incomplete report",
  bad.ok === false && bad.issues.length > 0,
);

const fixtureRoot = mkdtempSync(path.join(tmpdir(), "rn-migrate-d4-"));
try {
  const pkgPath = path.join(fixtureRoot, "package.json");
  writeFileSync(
    pkgPath,
    JSON.stringify({
      name: "expo-fixture",
      dependencies: {
        expo: "~52.0.0",
        "react-native": "0.76.5",
      },
    }),
  );
  mkdirSync(path.join(fixtureRoot, "android"));

  const beforeStat = statSync(pkgPath);
  const beforeHash = digestFile(pkgPath);

  const apiReport = buildExpoMigrateDryRunReport(fixtureRoot);
  const apiValidation = core.validateMigrationDryRunReport(apiReport);
  step(
    "expo API report contract",
    apiValidation.ok,
    apiValidation.issues[0]?.reason,
  );
  step("expo tracks 0/1/2", apiReport.tracks.map((t) => t.id).join(",") === "0,1,2");
  step("expo has recommendation", apiReport.tracks.some((t) => t.recommended));

  const cli = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "packages/rn/bin/rn.mjs"),
      "migrate",
      "expo",
      "--dry-run",
      "--json",
    ],
    { cwd: fixtureRoot, encoding: "utf8" },
  );
  step("cli exit 0", cli.status === 0, (cli.stderr || cli.stdout || "").trim());
  const cliReport = JSON.parse(cli.stdout.trim());
  const cliValidation = core.validateMigrationDryRunReport(cliReport);
  step(
    "cli JSON contract",
    cliValidation.ok,
    cliValidation.issues[0]?.reason,
  );

  const afterStat = statSync(pkgPath);
  const afterHash = digestFile(pkgPath);
  step("package.json hash unchanged", beforeHash === afterHash);
  step(
    "package.json mtime unchanged",
    beforeStat.mtimeMs === afterStat.mtimeMs,
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("PASS verify-migration-dry-run");
