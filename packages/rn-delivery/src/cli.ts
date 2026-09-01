import { runBuild } from "./build.js";
import { runPromote } from "./promote.js";
import { runBlock, runRelease } from "./release.js";
import {
  runSignalClear,
  runSignalList,
  runSignalRecord,
} from "./quality-signals.js";
import { runSign } from "./sign.js";
import { runServe } from "./serve.js";
import type { DeliveryPlatform, DeliveryProfile } from "./types.js";
import { runUpdate } from "./update.js";
import { runValidate } from "./validate.js";
import { DeliveryError, EXIT_FAIL, EXIT_OK, EXIT_USAGE } from "./util.js";

const USAGE = `Usage: rn-delivery <command> [options]

Delivery host for candidate packages. Do not use for store submit.

Stage contract (fixed):
  validate → compile → sign → test → attest → promote → submit

Commands:
  build [--platform android|ios|all] [--profile debug-host|release]
    App-host compile (Gradle/xcodebuild). Writes .rn/delivery/last-candidate.json.
  update --module <id> [--profile release]
    Per-module js-update bundle (compile). Not Metro dev output.
  sign [--candidate <path>]
    Thin sign stage: digest-seal signature + stub SBOM slot (M5).
  validate [--candidate <path>]
    Release preflight: hygiene + metadata (+ signature for js-update).
  release [--platform android|ios] [--candidate <path>] [--install]
    Promote candidate to staging (file CP stub); --install for app-host APK only.
  promote [--digest <sha256>] [--candidate <path>]
    Same-artifact promote: staging → production (M6).
  block [--candidate <path>] [--reason <text>]
    Block candidate in registry (rollback drill).
  signal record --module <id> --update-id <id> --kind crash|js_error|anr|perf|custom|e2e_fail [--detail <text>] [--digest <sha256>]
    Append quality signal (M9 / Map C C1 — e2e_fail blocks promote, not compile).
  signal list
    List recorded quality signals.
  signal clear
    Clear quality signal store (HITL / drill reset).
  serve [--port <n>] [--host <addr>]
    Thin CP HTTP over .rn/delivery/registry.json (#7 demo API).
  test      Gate trigger (not implemented)
  submit    Store submit backends (not implemented — never use for stores)

Global:
  --help    Show this help

Exit: 0 help/success | 1 failure / not implemented | 2 usage
`;

const KNOWN = new Set([
  "build",
  "update",
  "sign",
  "validate",
  "release",
  "promote",
  "block",
  "signal",
  "serve",
  "test",
  "submit",
]);

function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parsePlatform(
  args: string[],
): "android" | "ios" | "all" | undefined {
  const value = flagValue(args, "--platform");
  if (value === undefined) return undefined;
  if (value === "android" || value === "ios" || value === "all") {
    return value;
  }
  throw new DeliveryError(
    "rn-delivery: --platform must be android|ios|all",
    EXIT_USAGE,
  );
}

function parseReleasePlatform(
  args: string[],
): DeliveryPlatform | undefined {
  const value = flagValue(args, "--platform");
  if (value === undefined) return undefined;
  if (value === "android" || value === "ios") {
    return value;
  }
  throw new DeliveryError(
    "rn-delivery release: --platform must be android|ios",
    EXIT_USAGE,
  );
}

function parseProfile(args: string[]): DeliveryProfile | undefined {
  const value = flagValue(args, "--profile");
  if (value === undefined) return undefined;
  if (value === "debug-host" || value === "release") {
    return value;
  }
  throw new DeliveryError(
    "rn-delivery: --profile must be debug-host|release",
    EXIT_USAGE,
  );
}

function requireModule(args: string[]): string {
  const moduleId = flagValue(args, "--module");
  if (!moduleId?.trim()) {
    throw new DeliveryError(
      "rn-delivery update: --module <business_module> required",
      EXIT_USAGE,
    );
  }
  return moduleId.trim();
}

function requireFlag(args: string[], flag: string, hint: string): string {
  const value = flagValue(args, flag);
  if (!value?.trim()) {
    throw new DeliveryError(hint, EXIT_USAGE);
  }
  return value.trim();
}

export async function run(argv = process.argv): Promise<number> {
  const args = argv.slice(2);
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    console.log(USAGE);
    return EXIT_OK;
  }

  if (args.length === 0) {
    console.error(
      "rn-delivery: pass a command. Delivery host is not for store submit.",
    );
    console.error("Run `rn-delivery --help` for commands.");
    return EXIT_FAIL;
  }

  const cmd = args[0];
  if (!cmd || !KNOWN.has(cmd)) {
    console.error(`rn-delivery: unknown command '${cmd ?? ""}'.`);
    console.error("Run `rn-delivery --help` for commands.");
    return EXIT_USAGE;
  }

  try {
    const rest = args.slice(1);

    if (cmd === "build") {
      await runBuild({
        cwd: process.cwd(),
        platform: parsePlatform(rest),
        profile: parseProfile(rest),
      });
      return EXIT_OK;
    }

    if (cmd === "update") {
      await runUpdate({
        cwd: process.cwd(),
        module: requireModule(rest),
        profile: parseProfile(rest) ?? "release",
      });
      return EXIT_OK;
    }

    if (cmd === "sign") {
      await runSign({
        cwd: process.cwd(),
        candidatePath: flagValue(rest, "--candidate"),
      });
      return EXIT_OK;
    }

    if (cmd === "validate") {
      await runValidate({
        cwd: process.cwd(),
        candidatePath: flagValue(rest, "--candidate"),
      });
      return EXIT_OK;
    }

    if (cmd === "release") {
      await runRelease({
        cwd: process.cwd(),
        install: hasFlag(rest, "--install"),
        platform: parseReleasePlatform(rest),
        candidatePath: flagValue(rest, "--candidate"),
      });
      return EXIT_OK;
    }

    if (cmd === "promote") {
      await runPromote({
        cwd: process.cwd(),
        digest: flagValue(rest, "--digest"),
        candidatePath: flagValue(rest, "--candidate"),
      });
      return EXIT_OK;
    }

    if (cmd === "block") {
      await runBlock({
        cwd: process.cwd(),
        reason: flagValue(rest, "--reason"),
        platform: parseReleasePlatform(rest),
        candidatePath: flagValue(rest, "--candidate"),
      });
      return EXIT_OK;
    }

    if (cmd === "serve") {
      const portRaw = flagValue(rest, "--port");
      await runServe({
        cwd: process.cwd(),
        port: portRaw ? Number(portRaw) : undefined,
        host: flagValue(rest, "--host"),
      });
      return EXIT_OK;
    }

    if (cmd === "signal") {
      const sub = rest[0];
      const subArgs = rest.slice(1);
      if (sub === "record") {
        await runSignalRecord({
          cwd: process.cwd(),
          module: requireFlag(
            subArgs,
            "--module",
            "signal record: --module <business_module> required",
          ),
          updateId: requireFlag(
            subArgs,
            "--update-id",
            "signal record: --update-id required",
          ),
          kind: requireFlag(
            subArgs,
            "--kind",
            "signal record: --kind crash|js_error|anr|perf|custom|e2e_fail required",
          ),
          detail: flagValue(subArgs, "--detail"),
          digest: flagValue(subArgs, "--digest"),
        });
        return EXIT_OK;
      }
      if (sub === "list") {
        await runSignalList({ cwd: process.cwd() });
        return EXIT_OK;
      }
      if (sub === "clear") {
        await runSignalClear({ cwd: process.cwd() });
        return EXIT_OK;
      }
      throw new DeliveryError(
        "rn-delivery signal: use record|list|clear",
        EXIT_USAGE,
      );
    }

    console.error(
      `rn-delivery ${cmd}: not implemented. Do not use for store submit.`,
    );
    return EXIT_FAIL;
  } catch (err) {
    if (err instanceof DeliveryError) {
      if (err.message) console.error(err.message);
      return err.exitCode;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return EXIT_FAIL;
  }
}
