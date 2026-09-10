import { runIngestHost } from "./ingest-host.js";
import { runIngestPack } from "./ingest-pack.js";
import { runBuild } from "./build.js";
import { runPromote } from "./promote.js";
import { runBlock, runRelease } from "./release.js";
import {
  runSignalClear,
  runSignalList,
  runSignalRecord,
} from "./quality-signals.js";
import { runSign } from "./sign.js";
import { runCpServe, runServe } from "./serve.js";
import type { DeliveryPlatform, DeliveryProfile } from "./types.js";
import { runUpdate } from "./update.js";
import { runValidate } from "./validate.js";
import { DeliveryError, EXIT_FAIL, EXIT_OK, EXIT_USAGE } from "./util.js";

const USAGE = `Usage: ship <command> [options]

Delivery host for candidate packages. Do not use for store submit.

Stage contract (fixed):
  validate → compile → sign → test → attest → promote → submit

Commands:
  build [--platform android|ios|all] [--profile debug-host|release]
    App-host compile (Gradle/xcodebuild). Writes .rn/delivery/last-candidate.json.
  update --module <id> [--profile release]
    Per-module js-update bundle (compile). Not Metro dev output.
  ingest-pack --module <id> [--hbc <path>]
    Ingest pack-business HBC at assets/ota/<id>/index.hbc as js-update candidate.
  keygen [--dir <keys-dir>] [--label <name>]
    Generate a lab Ed25519 signing keypair (canonical keys dir, 0600) and
    print the public-key hex for baking (SEAM-1/F01). Production stays HITL.
  ingest-host --apk <path> [--profile release|debug-host]
    Register existing APK as app-host candidate (skip Gradle rebuild).
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
  cp-serve [--port <n>] [--host <addr>]
    Map C C2 — same APIs as serve, service identity face (RN_CP_PROJECT optional).
  test      Gate trigger (not implemented)
  submit    Store submit backends (not implemented — never use for stores)

Global:
  --help    Show this help

Exit: 0 help/success | 1 failure / not implemented | 2 usage
`;

const KNOWN = new Set([
  "build",
  "update",
  "ingest-pack",
  "keygen",
  "ingest-host",
  "sign",
  "validate",
  "release",
  "promote",
  "block",
  "signal",
  "serve",
  "cp-serve",
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
    "ship: --platform must be android|ios|all",
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
    "ship release: --platform must be android|ios",
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
    "ship: --profile must be debug-host|release",
    EXIT_USAGE,
  );
}

function requireModule(args: string[]): string {
  const moduleId = flagValue(args, "--module");
  if (!moduleId?.trim()) {
    throw new DeliveryError(
      "ship update: --module <business_module> required",
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
      "ship: pass a command. Delivery host is not for store submit.",
    );
    console.error("Run `ship --help` for commands.");
    return EXIT_FAIL;
  }

  const cmd = args[0];
  if (!cmd || !KNOWN.has(cmd)) {
    console.error(`ship: unknown command '${cmd ?? ""}'.`);
    console.error("Run `ship --help` for commands.");
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

    if (cmd === "ingest-pack") {
      await runIngestPack({
        cwd: process.cwd(),
        module: requireModule(rest),
        hbcPath: flagValue(rest, "--hbc"),
        profile: parseProfile(rest) ?? "release",
      });
      return EXIT_OK;
    }

    if (cmd === "ingest-host") {
      const apk = flagValue(rest, "--apk");
      if (!apk?.trim()) {
        throw new DeliveryError("ingest-host: --apk <path> required", EXIT_USAGE);
      }
      await runIngestHost({
        cwd: process.cwd(),
        apkPath: apk,
        profile: parseProfile(rest) ?? "release",
      });
      return EXIT_OK;
    }

    if (cmd === "keygen") {
      const {
        runKeygen,
        printKeygenResult,
        runKeygenCertChain,
        DEFAULT_KEYS_DIR,
      } = await import("./keygen.js");
      const dir = flagValue(rest, "--dir") ?? DEFAULT_KEYS_DIR;
      const label = flagValue(rest, "--label");
      if (rest.includes("--cert")) {
        const chain = runKeygenCertChain({ dir, label: label ?? "lab-sign-key" });
        console.log(
          JSON.stringify(
            {
              ok: true,
              action: "keygen-cert",
              leaf_cert: chain.leafCertFile,
              root_ca_cert: chain.rcaCertFile,
              root_ca_public_key_hex: chain.rcaPubkeyHex,
              next: [`bake RCA pubkey (device trust root): apply-ota --rca-pubkey-hex ${chain.rcaPubkeyHex}`],
            },
            null,
            2,
          ),
        );
        return EXIT_OK;
      }
      printKeygenResult(runKeygen({ dir, label }));
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

    if (cmd === "cp-serve") {
      const portRaw = flagValue(rest, "--port");
      await runCpServe({
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
        "ship signal: use record|list|clear",
        EXIT_USAGE,
      );
    }

    console.error(
      `ship ${cmd}: not implemented. Do not use for store submit.`,
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
