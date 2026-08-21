import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildRnExactTuple,
  MANIFEST_FILENAME,
  renderDefaultManifestJsonc,
  RN_GREENFIELD_INIT_VERSION,
  RN_GREENFIELD_MAJOR_MINOR,
} from "@client-platform/rn-core";
import { CliError, EXIT_FAIL } from "../errors.js";
import type { CliLogger } from "../logger.js";
import { resolveNpx, runStreaming } from "../process.js";

const COMMUNITY_CLI = "@react-native-community/cli@latest";

/** Files/dirs Community CLI may leave that we tolerate in an "empty" cwd. */
const ALLOWED_PREEXISTING = new Set([
  ".git",
  ".gitignore",
  ".DS_Store",
  "node-compile-cache",
]);

function sanitizeAppName(cwd: string): string {
  const base = path.basename(path.resolve(cwd));
  const cleaned = base.replace(/[^A-Za-z0-9_]/g, "");
  if (cleaned.length === 0 || !/^[A-Za-z]/.test(cleaned)) {
    return "PureRnApp";
  }
  return cleaned;
}

function readReactNativeVersion(projectRoot: string): string {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) {
    return RN_GREENFIELD_INIT_VERSION;
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const raw =
      pkg.dependencies?.["react-native"] ??
      pkg.devDependencies?.["react-native"];
    if (!raw) {
      return RN_GREENFIELD_INIT_VERSION;
    }
    const match = raw.match(/(\d+\.\d+\.\d+)/);
    return match?.[1] ?? RN_GREENFIELD_INIT_VERSION;
  } catch {
    return RN_GREENFIELD_INIT_VERSION;
  }
}

/**
 * Community CLI computes `path.relative(cwd, directory)`.
 * Absolute cwd / `.` become `''` and mkdir fails — always use a relative
 * subdirectory name, then hoist into the target cwd.
 */
function communityCliArgs(appName: string): string[] {
  return [
    "--yes",
    COMMUNITY_CLI,
    "init",
    appName,
    "--version",
    RN_GREENFIELD_INIT_VERSION,
    "--directory",
    appName,
    "--pm",
    "npm",
    "--skip-git-init",
    "--install-pods",
    "false",
  ];
}

function assertCwdAcceptsInit(cwd: string): void {
  if (existsSync(path.join(cwd, MANIFEST_FILENAME))) {
    throw new CliError(`${MANIFEST_FILENAME} already exists`, EXIT_FAIL);
  }
  if (existsSync(path.join(cwd, "ios")) || existsSync(path.join(cwd, "android"))) {
    throw new CliError(
      "ios/ or android/ already exists — refuse to overwrite a native tree",
      EXIT_FAIL,
    );
  }
  const entries = readdirSync(cwd).filter((name) => !ALLOWED_PREEXISTING.has(name));
  if (entries.length > 0) {
    throw new CliError(
      `cwd is not empty (${entries.slice(0, 5).join(", ")}${entries.length > 5 ? ", …" : ""}). Run rn init in an empty directory.`,
      EXIT_FAIL,
    );
  }
}

/** Move Community CLI output from ./appName into cwd. */
function hoistProjectToCwd(cwd: string, appName: string): void {
  const staged = path.join(cwd, appName);
  if (!existsSync(staged)) {
    throw new CliError(
      `Community CLI did not create expected directory ${appName}/`,
      EXIT_FAIL,
    );
  }
  for (const entry of readdirSync(staged)) {
    const from = path.join(staged, entry);
    const to = path.join(cwd, entry);
    if (existsSync(to)) {
      throw new CliError(`cannot hoist ${entry}: already exists in cwd`, EXIT_FAIL);
    }
    renameSync(from, to);
  }
  rmSync(staged, { recursive: true, force: true });
}

export async function runInit(options: {
  cwd: string;
  dryRun: boolean;
  logger: CliLogger;
}): Promise<void> {
  const cwd = path.resolve(options.cwd);
  const appName = sanitizeAppName(cwd);
  const npx = resolveNpx();
  const cliArgs = communityCliArgs(appName);
  const rnExactTuplePreview = buildRnExactTuple(RN_GREENFIELD_INIT_VERSION);

  const plan = {
    dryRun: options.dryRun,
    appName,
    rnTrain: `${RN_GREENFIELD_MAJOR_MINOR}.x`,
    initVersion: RN_GREENFIELD_INIT_VERSION,
    orchestrate: `${npx} ${cliArgs.join(" ")}`,
    hoist: `move ${appName}/* → cwd`,
    overlay: [MANIFEST_FILENAME],
    expects: ["package.json", "ios/", "android/"],
    rnExactTuple: rnExactTuplePreview,
    notes: [
      "Hermes V1 + New Architecture are defaults on RN 0.87.x (no legacy arch).",
      "HarmonyOS is contract-reserved; A1 template targets ios+android only.",
      "Pods are skipped at init; run pod install on darwin before iOS device runs.",
      "Community CLI cannot init into cwd via absolute --directory; we stage then hoist.",
    ],
  };

  if (options.logger.json) {
    options.logger.writeMachine(plan);
  } else {
    options.logger.writeHuman(
      options.dryRun
        ? "init plan (dry-run, no write):"
        : "init will orchestrate:",
    );
    options.logger.writeHuman(`  appName: ${appName}`);
    options.logger.writeHuman(
      `  RN train: ${RN_GREENFIELD_MAJOR_MINOR}.x (pin ${RN_GREENFIELD_INIT_VERSION})`,
    );
    options.logger.writeHuman(`  orchestrate: ${plan.orchestrate}`);
    options.logger.writeHuman(`  hoist: ${plan.hoist}`);
    options.logger.writeHuman(`  overlay: ${MANIFEST_FILENAME}`);
    options.logger.writeHuman(`  rnExactTuple (preview): ${rnExactTuplePreview}`);
    for (const note of plan.notes) {
      options.logger.writeHuman(`  note: ${note}`);
    }
  }

  if (options.dryRun) {
    return;
  }

  assertCwdAcceptsInit(cwd);

  // Ensure cwd exists (mkdtemp users already have it).
  mkdirSync(cwd, { recursive: true });

  options.logger.info(
    `Running Community CLI init for React Native ${RN_GREENFIELD_INIT_VERSION}…`,
  );
  const code = await runStreaming(npx, cliArgs, {
    cwd,
    env: {
      CI: "1",
      npm_config_yes: "true",
    },
  });
  if (code !== 0) {
    throw new CliError(
      `Community CLI init failed (exit ${code}). Network/template fetch may be unavailable; retry with network access or use --dry-run to inspect the plan.`,
      EXIT_FAIL,
    );
  }

  hoistProjectToCwd(cwd, appName);

  if (!existsSync(path.join(cwd, "android")) || !existsSync(path.join(cwd, "ios"))) {
    throw new CliError(
      "Community CLI init finished but ios/ or android/ is missing after hoist",
      EXIT_FAIL,
    );
  }

  const rnVersion = readReactNativeVersion(cwd);
  const manifest = renderDefaultManifestJsonc({ rnVersion });
  writeFileSync(path.join(cwd, MANIFEST_FILENAME), manifest, "utf8");

  const tuple = buildRnExactTuple(rnVersion);
  if (options.logger.json) {
    options.logger.writeMachine({
      ok: true,
      rnVersion,
      rnExactTuple: tuple,
      manifest: MANIFEST_FILENAME,
    });
  } else {
    options.logger.writeHuman(
      `Wrote ${MANIFEST_FILENAME} (rnExactTuple=${tuple})`,
    );
    options.logger.writeHuman(
      "Next: rn doctor → rn dev → rn-delivery build (requires Android SDK / Xcode for native packages).",
    );
  }
}
