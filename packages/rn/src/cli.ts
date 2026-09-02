import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";

import { shouldLoadPluginCommands } from "./argv.js";
import { runConfigValidate } from "./commands/config.js";
import { runCatalogList, runCatalogPublish, runCatalogServe } from "./commands/catalog.js";
import { runSessionStatus } from "./commands/session.js";
import { runDemoAdd, runDemoRemove } from "./commands/demo.js";
import { runDevSupportAdd, runDevSupportRemove } from "./commands/dev-support.js";
import { runDev } from "./commands/dev.js";
import { runDoctor } from "./commands/doctor.js";
import { parseDoctorProfile } from "./brownfield-doctor.js";
import { runHostAndroid } from "./commands/host-android.js";
import { runInit, parseInitStarter } from "./commands/init.js";
import { runModuleInit, runModuleLink, runModuleDev } from "./commands/module.js";
import { runMigrate } from "./commands/migrate.js";
import { runPluginList } from "./commands/plugin.js";
import { runSelfUninstall, runSelfUpdate } from "./commands/self.js";
import { CliError, EXIT_FAIL, EXIT_OK, EXIT_USAGE } from "./errors.js";
import { parseDevTransportMode } from "./dev-transport.js";
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
    .command("doctor")
    .description(
      "Unified diagnostics: host L0–L2 (CLI / assisted packages / manual) + project L3 when present",
    )
    .option(
      "--strict",
      "fail when L1 device-build packages (or Xcode on macOS) are missing",
    )
    .option(
      "--profile <name>",
      "greenfield (default) | brownfield | expo — profile-specific contract checks",
      "greenfield",
    )
    .action(async (opts: { strict?: boolean; profile?: string }) => {
      let profile;
      try {
        profile = parseDoctorProfile(opts.profile);
      } catch (err) {
        throw new CliError(
          err instanceof Error ? err.message : String(err),
          EXIT_USAGE,
        );
      }
      await runDoctor({
        cwd: process.cwd(),
        logger: loggerFromArgv(argv),
        strict: Boolean(opts.strict),
        profile,
      });
    });

  const hostCmd = program
    .command("host")
    .description("Host toolchain setup (mutates machine; explicit consent)");
  hostCmd
    .command("android")
    .description(
      "Detect / install JDK 17 + Android SDK + adb (idempotent; wraps scripts/setup-host-android.sh)",
    )
    .option("--check", "detect only (exit 1 if not ready)")
    .option("--dry-run", "print install plan without changes")
    .option("--yes", "non-interactive install (required with --non-interactive)")
    .action(async (opts: { check?: boolean; dryRun?: boolean; yes?: boolean }) => {
      if (opts.check && opts.dryRun) {
        throw new CliError("pass only one of --check or --dry-run", EXIT_USAGE);
      }
      const mode = opts.check ? "check" : opts.dryRun ? "dry-run" : "install";
      await runHostAndroid({
        logger: loggerFromArgv(argv),
        mode,
        yes: Boolean(opts.yes),
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
    .command("init")
    .description(
      "Orchestrate React Native 0.87 Community CLI init + overlay platform manifest (non-interactive)",
    )
    .argument(
      "[directory]",
      "empty target directory (default: cwd). Prefer running via monorepo bin: pnpm exec rn init /path/to/app",
    )
    .option("--dry-run", "print the orchestration plan without creating files")
    .option(
      "--npm-policy <policy>",
      'how init runs npx/npm: "inherit" (default, use ~/.npmrc) or "isolated"',
    )
    .option(
      "--isolated-npmrc",
      "shorthand for --npm-policy isolated (CI / ignore noisy global npm configs)",
    )
    .option(
      "--npm-registry <url>",
      "force npm registry for Community CLI (also CLIENT_PLATFORM_NPM_REGISTRY)",
    )
    .option("--demo", "after init, implant the sample demo (rn demo add)")
    .option(
      "--starter <name>",
      'topology-b (default, shell + modules/main) | inline-main (path A onboarding)',
      "topology-b",
    )
    .action(
      async (
        directory: string | undefined,
        opts: {
          dryRun?: boolean;
          npmPolicy?: string;
          isolatedNpmrc?: boolean;
          npmRegistry?: string;
          demo?: boolean;
          starter?: string;
        },
      ) => {
        let starter;
        try {
          starter = parseInitStarter(opts.starter);
        } catch (err) {
          throw new CliError(
            err instanceof Error ? err.message : String(err),
            EXIT_USAGE,
          );
        }
        const cwd = directory ? path.resolve(directory) : process.cwd();
        await runInit({
          cwd,
          dryRun: Boolean(opts.dryRun),
          logger: loggerFromArgv(argv),
          npmPolicy: opts.npmPolicy,
          isolatedNpmrc: Boolean(opts.isolatedNpmrc),
          npmRegistry: opts.npmRegistry,
          demo: Boolean(opts.demo),
          starter,
        });
      },
    );

  const moduleCmd = program
    .command("module")
    .description("Business module workspaces (ADR-005 topology B — not app-hosts)");
  moduleCmd
    .command("init")
    .description("Scaffold modules/<id> and link into .rn/dev-session.jsonc")
    .argument("<moduleId>", "business_module id (e.g. checkout)")
    .option("--no-link", "scaffold only; do not write dev-session")
    .option("--metro-port <port>", "Metro port for this module", (v) =>
      Number.parseInt(v, 10),
    )
    .option("--dry-run", "print plan without changes")
    .action(
      async (
        moduleId: string,
        opts: { link?: boolean; metroPort?: number; dryRun?: boolean },
      ) => {
        await runModuleInit({
          cwd: process.cwd(),
          moduleId,
          logger: loggerFromArgv(argv),
          link: opts.link !== false,
          metroPort: opts.metroPort,
          dryRun: Boolean(opts.dryRun),
        });
      },
    );
  moduleCmd
    .command("link")
    .description("Link an existing modules/<id> into .rn/dev-session.jsonc")
    .argument("<moduleId>", "business_module id")
    .option("--metro-port <port>", "Metro port", (v) => Number.parseInt(v, 10))
    .option("--entry <path>", "Metro entry relative to project root")
    .option("--dry-run", "print plan without changes")
    .action(
      async (
        moduleId: string,
        opts: { metroPort?: number; entry?: string; dryRun?: boolean },
      ) => {
        await runModuleLink({
          cwd: process.cwd(),
          moduleId,
          logger: loggerFromArgv(argv),
          metroPort: opts.metroPort,
          entry: opts.entry,
          dryRun: Boolean(opts.dryRun),
        });
      },
    );
  moduleCmd
    .command("dev")
    .description(
      "Business cwd: ensure Broker, register Live, start/reuse Metro (Self-Descriptor)",
    )
    .option("--broker-host <host>", "Dev Session Broker host", "127.0.0.1")
    .option(
      "--broker-port <port>",
      "Dev Session Broker port",
      (v) => Number.parseInt(v, 10),
      7420,
    )
    .option(
      "--catalog-base-url <url>",
      "Optional Catalog Service base URL for membership warn",
    )
    .action(
      async (opts: {
        brokerHost?: string;
        brokerPort?: number;
        catalogBaseUrl?: string;
      }) => {
        await runModuleDev({
          cwd: process.cwd(),
          logger: loggerFromArgv(argv),
          brokerHost: opts.brokerHost,
          brokerPort: opts.brokerPort,
          catalogBaseUrl: opts.catalogBaseUrl,
        });
      },
    );

  const catalogCmd = program
    .command("catalog")
    .description(
      "Product Module Catalog (publish SoT; shell .rn/dev-session.jsonc is draft only)",
    );
  catalogCmd
    .command("publish")
    .description("Publish draft modules from .rn/dev-session.jsonc to Catalog Service store")
    .option("--product-app <id>", "productApp id (default: cwd basename)")
    .option("--catalog-root <path>", "override catalog store root")
    .option("--embed-out <path>", "write embed snapshot JSON for Debug Host bake")
    .action(
      async (opts: {
        productApp?: string;
        catalogRoot?: string;
        embedOut?: string;
      }) => {
        await runCatalogPublish({
          cwd: process.cwd(),
          logger: loggerFromArgv(argv),
          productApp: opts.productApp,
          catalogRoot: opts.catalogRoot,
          embedOut: opts.embedOut,
        });
      },
    );
  catalogCmd
    .command("list")
    .description("List published catalog (not draft). link alone does not appear here")
    .option("--product-app <id>", "productApp id")
    .option("--catalog-root <path>", "override catalog store root")
    .option("--base-url <url>", "P2: fetch from Catalog Service instead of local store")
    .action(
      async (opts: {
        productApp?: string;
        catalogRoot?: string;
        baseUrl?: string;
      }) => {
        await runCatalogList({
          cwd: process.cwd(),
          logger: loggerFromArgv(argv),
          productApp: opts.productApp,
          catalogRoot: opts.catalogRoot,
          baseUrl: opts.baseUrl,
        });
      },
    );
  catalogCmd
    .command("serve")
    .description("Run local Catalog Service (GET modules / POST publish)")
    .option("--catalog-root <path>", "override catalog store root")
    .option("--host <host>", "bind host", "127.0.0.1")
    .option("--port <port>", "bind port", (v) => Number.parseInt(v, 10), 7410)
    .action(
      async (opts: { catalogRoot?: string; host?: string; port?: number }) => {
        await runCatalogServe({
          logger: loggerFromArgv(argv),
          catalogRoot: opts.catalogRoot,
          host: opts.host,
          port: opts.port,
        });
      },
    );

  const sessionCmd = program
    .command("session")
    .description("Dev Session Broker (Live SoT; local debug only)");
  sessionCmd
    .command("status")
    .description("List Live modules from Dev Session Broker")
    .option("--base-url <url>", "Broker base URL (default http://127.0.0.1:7420)")
    .option("--host <host>", "Broker host when --base-url omitted", "127.0.0.1")
    .option(
      "--port <port>",
      "Broker port when --base-url omitted",
      (v) => Number.parseInt(v, 10),
      7420,
    )
    .action(
      async (opts: { baseUrl?: string; host?: string; port?: number }) => {
        await runSessionStatus({
          logger: loggerFromArgv(argv),
          baseUrl: opts.baseUrl,
          host: opts.host,
          port: opts.port,
        });
      },
    );

  const demoCmd = program
    .command("demo")
    .description("Sample demo implant (pure-rn teaching scaffold)");
  demoCmd
    .command("add")
    .description("Add src/sample/ work-order demo + wire App entry")
    .option("--dry-run", "print plan without changes")
    .action(async (opts: { dryRun?: boolean }) => {
      await runDemoAdd({
        cwd: process.cwd(),
        logger: loggerFromArgv(argv),
        dryRun: Boolean(opts.dryRun),
      });
    });
  demoCmd
    .command("remove")
    .description("Remove sample demo and restore upstream Hello entry")
    .option("--dry-run", "print plan without changes")
    .action(async (opts: { dryRun?: boolean }) => {
      await runDemoRemove({
        cwd: process.cwd(),
        logger: loggerFromArgv(argv),
        dryRun: Boolean(opts.dryRun),
      });
    });

  const devSupportCmd = program
    .command("dev-support")
    .description("Debug affordance (FAB → RN Dev Menu); independent of sample demo");
  devSupportCmd
    .command("add")
    .description("Wrap App entry with DevSupportRoot (debug builds only)")
    .option("--dry-run", "print plan without changes")
    .action(async (opts: { dryRun?: boolean }) => {
      await runDevSupportAdd({
        cwd: process.cwd(),
        logger: loggerFromArgv(argv),
        dryRun: Boolean(opts.dryRun),
      });
    });
  devSupportCmd
    .command("remove")
    .description("Restore App entry and remove dev-support module")
    .option("--dry-run", "print plan without changes")
    .action(async (opts: { dryRun?: boolean }) => {
      await runDevSupportRemove({
        cwd: process.cwd(),
        logger: loggerFromArgv(argv),
        dryRun: Boolean(opts.dryRun),
      });
    });

  program
    .command("dev")
    .description(
      "Dev server & platform attach. `rn dev --android` starts Metro, installs, then keeps Metro running (Ctrl+C to stop).",
    )
    .option("--android", "build & install on Android (Metro orchestrated)")
    .option("--ios", "build & install on iOS (darwin + Xcode; Metro orchestrated)")
    .option("--metro-only", "Metro foreground only (same as bare `rn dev`)")
    .option(
      "--no-metro",
      "with --android/--ios: fail if Metro is not already running (do not start)",
    )
    .option(
      "--stop-metro",
      "with --android/--ios: stop Metro after install (only if this command started it)",
    )
    .option(
      "--detach-metro",
      "with --android/--ios: leave Metro in background and exit CLI after install",
    )
    .option(
      "--transport <mode>",
      "Android DevTransport: auto|usb|wifi|lan (default: auto)",
    )
    .option("--device <serial>", "Android adb device serial or host:port")
    .option(
      "--no-active-arch-only",
      "Android: build all ABIs from gradle.properties (slower; default is single-ABI when one device)",
    )
    .option(
      "--modules <ids>",
      "Parallel Metro for business_modules (comma-separated; requires .rn/dev-session.jsonc)",
    )
    .action(
      async (opts: {
        android?: boolean;
        ios?: boolean;
        metroOnly?: boolean;
        noMetro?: boolean;
        stopMetro?: boolean;
        detachMetro?: boolean;
        transport?: string;
        device?: string;
        noActiveArchOnly?: boolean;
        modules?: string;
      }) => {
        const platformFlags = [opts.android, opts.ios, opts.metroOnly].filter(Boolean);
        if (platformFlags.length > 1) {
          throw new CliError(
            "pass only one of --android, --ios, or --metro-only",
            EXIT_USAGE,
          );
        }
        if (
          (opts.noMetro || opts.stopMetro || opts.detachMetro) &&
          !opts.android &&
          !opts.ios &&
          !opts.modules
        ) {
          throw new CliError(
            "--no-metro, --stop-metro, and --detach-metro require --android, --ios, or --modules",
            EXIT_USAGE,
          );
        }
        await runDev({
          cwd: process.cwd(),
          logger: loggerFromArgv(argv),
          android: Boolean(opts.android),
          ios: Boolean(opts.ios),
          metroOnly: Boolean(opts.metroOnly),
          noMetro: Boolean(opts.noMetro),
          stopMetro: Boolean(opts.stopMetro),
          detachMetro: Boolean(opts.detachMetro),
          transport: opts.transport
            ? parseDevTransportMode(opts.transport)
            : undefined,
          device: opts.device,
          activeArchOnly: opts.noActiveArchOnly ? false : undefined,
          modules: opts.modules,
        });
      },
    );

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

  program
    .command("migrate")
    .description("Migration advisors (v1: dry-run only; never mutates files)")
    .argument("[source]", "shorthand source (expo)")
    .option("--from <source>", "migration source (expo)")
    .option("--dry-run", "report track recommendations without modifying files")
    .action(
      async (
        positionalSource: string | undefined,
        opts: { from?: string; dryRun?: boolean },
      ) => {
        await runMigrate({
          cwd: process.cwd(),
          logger: loggerFromArgv(argv),
          from: opts.from,
          positionalSource,
          dryRun: Boolean(opts.dryRun),
        });
      },
    );

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
