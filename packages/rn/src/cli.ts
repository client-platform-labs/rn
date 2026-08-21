import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";

import { shouldLoadPluginCommands } from "./argv.js";
import { runConfigValidate } from "./commands/config.js";
import { runDev } from "./commands/dev.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runPluginList } from "./commands/plugin.js";
import { runPreflight } from "./commands/preflight.js";
import { runSelfUninstall, runSelfUpdate } from "./commands/self.js";
import { CliError, EXIT_FAIL, EXIT_OK, EXIT_USAGE } from "./errors.js";
import {
  createLogger,
  peekArgvFlags,
  resolveRuntimeFlags,
  type CliLogger,
} from "./logger.js";
import { registerCliCommandPlugins } from "./register-plugins.js";

function packageVersion(): string {
  const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
  const pkg = JSON.parse(
    readFileSync(path.join(pkgRoot, "package.json"), "utf8"),
  ) as { version: string };
  return pkg.version;
}

function loggerFromArgv(argv: string[]): CliLogger {
  return createLogger(resolveRuntimeFlags(peekArgvFlags(argv)));
}

export async function run(argv = process.argv): Promise<number> {
  const logger = loggerFromArgv(argv);
  const program = new Command();

  program
    .name("rn")
    .description("Client Platform Labs rn product CLI")
    .version(packageVersion())
    .option("--json", "JSON on stdout; human logs on stderr; implies non-interactive")
    .option("--non-interactive", "do not prompt; fail instead of asking")
    .showHelpAfterError()
    .exitOverride();

  program
    .command("preflight")
    .description(
      "Host/toolchain preflight (Node, git, curl, pnpm, PATH, install home, optional SDKs) — no project required",
    )
    .option("--strict", "treat missing native SDKs as failures")
    .action((opts: { strict?: boolean }) => {
      runPreflight({
        logger: loggerFromArgv(argv),
        strict: Boolean(opts.strict),
      });
    });

  const selfCmd = program
    .command("self")
    .description("Manage this rn CLI installation (update / uninstall)");
  selfCmd
    .command("update")
    .description("git pull (managed home) + pnpm install/build + relink bins")
    .action(async () => {
      await runSelfUpdate({ logger: loggerFromArgv(argv) });
    });
  selfCmd
    .command("uninstall")
    .description("Remove linked bins, profile PATH markers, and install home")
    .option("--yes", "confirm destructive uninstall")
    .action(async (opts: { yes?: boolean }) => {
      await runSelfUninstall({
        logger: loggerFromArgv(argv),
        yes: Boolean(opts.yes),
      });
    });

  program
    .command("doctor")
    .description(
      "Greenfield checks: Node 24, workspace packages, manifest/tuple, Android SDK/adb (warn), xcodebuild on darwin (warn)",
    )
    .option(
      "--strict",
      "fail on missing native SDKs (default: warn so CI without SDK still passes)",
    )
    .action(async (opts: { strict?: boolean }) => {
      await runDoctor({
        cwd: process.cwd(),
        logger: loggerFromArgv(argv),
        strict: Boolean(opts.strict),
      });
    });

  program
    .command("init")
    .description(
      "Orchestrate React Native 0.87 Community CLI init + overlay platform manifest (non-interactive)",
    )
    .argument(
      "[directory]",
      "empty target directory (default: cwd). Prefer running via monorepo bin: pnpm exec rn init /path/to/app",
    )
    .option("--dry-run", "print the orchestration plan without creating files")
    .action(async (directory: string | undefined, opts: { dryRun?: boolean }) => {
      const cwd = directory ? path.resolve(directory) : process.cwd();
      await runInit({
        cwd,
        dryRun: Boolean(opts.dryRun),
        logger: loggerFromArgv(argv),
      });
    });

  program
    .command("dev")
    .description(
      "Start Metro for the project (upstream). Optional --android / --ios call run-* when tools exist.",
    )
    .option("--android", "run upstream react-native run-android (requires adb)")
    .option("--ios", "run upstream react-native run-ios (darwin + Xcode)")
    .action(async (opts: { android?: boolean; ios?: boolean }) => {
      if (opts.android && opts.ios) {
        throw new CliError("pass only one of --android or --ios", EXIT_USAGE);
      }
      await runDev({
        cwd: process.cwd(),
        logger: loggerFromArgv(argv),
        android: Boolean(opts.android),
        ios: Boolean(opts.ios),
      });
    });

  const plugin = program.command("plugin").description("Plugin discovery");
  plugin
    .command("list")
    .description("List discovered plugin records without importing modules")
    .action(async () => {
      await runPluginList({ cwd: process.cwd(), logger: loggerFromArgv(argv) });
    });

  const config = program.command("config").description("Project contract");
  config
    .command("validate")
    .description("Validate client-platform.manifest.jsonc (JSONC + Ajv)")
    .action(() => {
      runConfigValidate({ cwd: process.cwd(), logger: loggerFromArgv(argv) });
    });

  if (shouldLoadPluginCommands(argv)) {
    await registerCliCommandPlugins(program, logger);
  }

  try {
    await program.parseAsync(argv);
    return EXIT_OK;
  } catch (err) {
    return handleError(err, logger);
  }
}

function handleError(err: unknown, logger: CliLogger): number {
  if (err instanceof CommanderError) {
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
      return EXIT_OK;
    }
    if (err.exitCode === 0) {
      return EXIT_OK;
    }
    if (err.message) {
      logger.warn(err.message);
    }
    return EXIT_USAGE;
  }
  if (err instanceof CliError) {
    if (err.message) {
      console.error(err.message);
    }
    return err.exitCode;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  return EXIT_FAIL;
}
