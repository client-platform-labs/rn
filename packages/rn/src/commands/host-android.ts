import { existsSync } from "node:fs";
import path from "node:path";

import { CliError, EXIT_FAIL, EXIT_USAGE } from "../errors.js";
import type { CliLogger } from "../logger.js";
import { runningRepoRoot } from "../install-home.js";
import { runStreaming } from "../process.js";

export type HostAndroidMode = "install" | "check" | "dry-run";

export function resolveHostAndroidScript(): string {
  const local = path.join(runningRepoRoot(), "scripts", "setup-host-android.sh");
  if (existsSync(local)) {
    return local;
  }
  throw new CliError(
    `setup-host-android.sh not found at ${local}. Re-run get-rn.sh or use the curl installer from docs.`,
    EXIT_FAIL,
  );
}

export async function runHostAndroid(options: {
  logger: CliLogger;
  mode: HostAndroidMode;
  yes?: boolean;
}): Promise<void> {
  if (process.platform === "win32") {
    throw new CliError(
      "rn host android is not supported on Windows yet. Install Android Studio + JDK 17 manually, then rn doctor --strict.",
      EXIT_FAIL,
    );
  }

  const script = resolveHostAndroidScript();
  const args: string[] = [];
  if (options.mode === "check") {
    args.push("--check");
  } else if (options.mode === "dry-run") {
    args.push("--dry-run");
  } else if (options.yes || options.logger.nonInteractive) {
    args.push("--yes");
  }

  if (options.mode === "install" && options.logger.nonInteractive && !options.yes) {
    throw new CliError(
      "refusing to install host toolchain without --yes in non-interactive mode",
      EXIT_USAGE,
    );
  }

  options.logger.info(`Running ${script} ${args.join(" ")}`.trim());
  const code = await runStreaming("bash", [script, ...args], {
    cwd: runningRepoRoot(),
  });
  if (code !== 0) {
    if (options.mode === "check") {
      throw new CliError(
        "host android: not ready (see warnings above). Next: rn host android --yes",
        code || EXIT_FAIL,
      );
    }
    throw new CliError(`host android setup failed (exit ${code})`, code || EXIT_FAIL);
  }
}
