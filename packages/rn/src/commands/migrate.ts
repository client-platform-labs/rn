import {
  buildBareBrownfieldAdvisorStub,
  findManifestRoot,
  validateMigrationDryRunReport,
} from "@client-platform/rn-core";

import type { CliLogger } from "../logger.js";
import { CliError, EXIT_USAGE } from "../errors.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { buildExpoMigrateDryRunReport, type ExpoMigrateDryRunReport } from "../expo-migrate.js";

export async function runMigrate(options: {
  cwd: string;
  logger: CliLogger;
  from?: string;
  positionalSource?: string;
  dryRun?: boolean;
}): Promise<void> {
  const source = options.from ?? options.positionalSource;
  if (!source) {
    throw new CliError(
      "migrate requires a source (e.g. rn migrate expo --dry-run or rn migrate --from expo --dry-run)",
      EXIT_USAGE,
    );
  }
  if (!options.dryRun) {
    throw new CliError(
      "migrate is dry-run only in v1 — pass --dry-run (no files will be modified)",
      EXIT_USAGE,
    );
  }

  const report =
    source === "expo"
      ? buildExpoMigrateDryRunReport(options.cwd)
      : source === "bare" || source === "brownfield"
        ? buildBareBrownfieldAdvisorStub(source, {
            hasIos: existsSync(path.join(options.cwd, "ios")),
            hasAndroid: existsSync(path.join(options.cwd, "android")),
            hasClientPlatformManifest: findManifestRoot(options.cwd) != null,
          })
        : null;

  if (!report) {
    throw new CliError(
      `unknown migrate source "${source}" (v1 supports: expo, bare, brownfield)`,
      EXIT_USAGE,
    );
  }

  const validation = validateMigrationDryRunReport(report);
  if (!validation.ok) {
    throw new CliError(
      `internal migration report failed contract: ${validation.issues[0]?.reason ?? "invalid"}`,
      EXIT_USAGE,
    );
  }

  if (options.logger.json) {
    options.logger.writeMachine(report);
    return;
  }

  options.logger.writeHuman(`rn migrate ${source} --dry-run`);
  options.logger.writeHuman(`source: ${report.source}`);
  if (report.source === "expo") {
    const expoReport = report as ExpoMigrateDryRunReport;
    options.logger.writeHuman(
      `detected: expo=${expoReport.detected.hasExpoPackage ? expoReport.detected.expoVersion : "none"} · rn=${expoReport.detected.reactNativeVersion ?? "?"}`,
    );
    options.logger.writeHuman(`sdk/rn: ${expoReport.sdkRnDrift.summary}`);
  } else {
    options.logger.writeHuman(
      `detected: ios=${Boolean(report.detected.hasIos)} · android=${Boolean(report.detected.hasAndroid)}`,
    );
  }
  if (report.tracks.length > 0) {
    options.logger.writeHuman("");
    options.logger.writeHuman("tracks:");
    for (const track of report.tracks) {
      options.logger.writeHuman(
        `  [${track.recommended ? "rec" : "   "}] ${track.id} ${track.name}: ${track.summary}`,
      );
      for (const risk of track.risks) {
        options.logger.writeHuman(`         risk: ${risk}`);
      }
    }
  }
  options.logger.writeHuman("");
  options.logger.writeHuman("global risks:");
  for (const risk of report.risks) {
    options.logger.writeHuman(`  - ${risk}`);
  }
  options.logger.writeHuman("");
  options.logger.writeHuman("note: dry-run only — no files modified (ADR-003)");
}
