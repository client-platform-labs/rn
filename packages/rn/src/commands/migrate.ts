import type { CliLogger } from "../logger.js";
import { CliError, EXIT_USAGE } from "../errors.js";
import { buildExpoMigrateDryRunReport } from "../expo-migrate.js";

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
  if (source !== "expo") {
    throw new CliError(
      `unknown migrate source "${source}" (v1 supports: expo)`,
      EXIT_USAGE,
    );
  }
  if (!options.dryRun) {
    throw new CliError(
      "migrate expo is dry-run only in v1 — pass --dry-run (no files will be modified)",
      EXIT_USAGE,
    );
  }

  const report = buildExpoMigrateDryRunReport(options.cwd);

  if (options.logger.json) {
    options.logger.writeMachine(report);
    return;
  }

  options.logger.writeHuman("rn migrate expo --dry-run");
  options.logger.writeHuman(`source: ${report.source}`);
  options.logger.writeHuman(
    `detected: expo=${report.detected.hasExpoPackage ? report.detected.expoVersion : "none"} · rn=${report.detected.reactNativeVersion ?? "?"}`,
  );
  options.logger.writeHuman(`sdk/rn: ${report.sdkRnDrift.summary}`);
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
  options.logger.writeHuman("");
  options.logger.writeHuman("global risks:");
  for (const risk of report.risks) {
    options.logger.writeHuman(`  - ${risk}`);
  }
  options.logger.writeHuman("");
  options.logger.writeHuman("note: dry-run only — no files modified (ADR-003)");
}
