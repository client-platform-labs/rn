import { runBuild } from "./build.js";
import type { DeliveryProfile } from "./types.js";
import { DeliveryError, EXIT_FAIL, EXIT_OK, EXIT_USAGE } from "./util.js";

const USAGE = `Usage: rn-delivery <command> [options]

Delivery host for candidate packages. Do not use for store submit.

Stage contract (fixed):
  validate → compile → sign → test → attest → promote → submit

Commands:
  build [--platform android|ios|all] [--profile debug-host|release]
    Orchestrate candidate packages (compile stage). Default profile: debug-host.
  sign      Signing orchestration (not implemented)
  test      Gate trigger (not implemented)
  release   Promote / release-train steps (not implemented)
  update    JS train / update channel (not implemented)
  submit    Store submit backends (not implemented — never use for stores)

Global:
  --help    Show this help

Exit: 0 help/success | 1 failure / not implemented | 2 usage
`;

const KNOWN = new Set([
  "build",
  "sign",
  "test",
  "release",
  "update",
  "submit",
]);

function parsePlatform(
  args: string[],
): "android" | "ios" | "all" | undefined {
  const idx = args.indexOf("--platform");
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (value === "android" || value === "ios" || value === "all") {
    return value;
  }
  throw new DeliveryError(
    "rn-delivery build: --platform must be android|ios|all",
    EXIT_USAGE,
  );
}

function parseProfile(args: string[]): DeliveryProfile | undefined {
  const idx = args.indexOf("--profile");
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (value === "debug-host" || value === "release") {
    return value;
  }
  throw new DeliveryError(
    "rn-delivery build: --profile must be debug-host|release",
    EXIT_USAGE,
  );
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
    if (cmd === "build") {
      const rest = args.slice(1);
      const platform = parsePlatform(rest);
      const profile = parseProfile(rest);
      await runBuild({ cwd: process.cwd(), platform, profile });
      return EXIT_OK;
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
