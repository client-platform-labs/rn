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
import { CliError, EXIT_FAIL, EXIT_USAGE } from "../errors.js";
import type { CliLogger } from "../logger.js";
import {
  buildNpmChildEnv,
  countNpmConfigKeys,
  formatNpmPolicyLine,
  parseNpmPolicyKind,
  resolveNpmPolicy,
} from "../npm-policy.js";
import { resolveNpx, runStreaming } from "../process.js";
import { runDemoAdd } from "./demo.js";
import { applyTopologyBAfterInit } from "../module-workspace.js";

const COMMUNITY_CLI = "@react-native-community/cli@latest";

export type InitStarter = "topology-b" | "inline-main";

export function parseInitStarter(raw: string | undefined): InitStarter {
  if (!raw || raw === "topology-b" || raw === "default") return "topology-b";
  if (raw === "inline-main") return "inline-main";
  throw new Error(
    `unknown --starter "${raw}" (expected topology-b|inline-main)`,
  );
}

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
  npmPolicy?: string;
  isolatedNpmrc?: boolean;
  npmRegistry?: string;
  demo?: boolean;
  /** Default topology-b (ADR-005). Use inline-main for onboarding path A. */
  starter?: InitStarter;
}): Promise<void> {
  if (options.isolatedNpmrc && options.npmPolicy) {
    const parsed = parseNpmPolicyKind(options.npmPolicy);
    if (parsed && parsed !== "isolated") {
      throw new CliError(
        "pass only one of --isolated-npmrc or --npm-policy <isolated|inherit>",
        EXIT_USAGE,
      );
    }
  }
  if (options.npmPolicy && !parseNpmPolicyKind(options.npmPolicy)) {
    throw new CliError(
      `--npm-policy must be "isolated" or "inherit" (got ${JSON.stringify(options.npmPolicy)})`,
      EXIT_USAGE,
    );
  }

  const starter: InitStarter = options.starter ?? "topology-b";
  const cwd = path.resolve(options.cwd);
  const appName = sanitizeAppName(cwd);
  const npx = resolveNpx();
  const cliArgs = communityCliArgs(appName);
  const rnExactTuplePreview = buildRnExactTuple(RN_GREENFIELD_INIT_VERSION);
  const npm = resolveNpmPolicy({
    flagPolicy: options.npmPolicy,
    isolatedNpmrc: options.isolatedNpmrc,
    flagRegistry: options.npmRegistry,
  });
  const npmConfigKeyCount = countNpmConfigKeys();

  const plan = {
    dryRun: options.dryRun,
    appName,
    starter,
    topology: starter === "topology-b" ? "shell-plus-modules" : "inline-main",
    rnTrain: `${RN_GREENFIELD_MAJOR_MINOR}.x`,
    initVersion: RN_GREENFIELD_INIT_VERSION,
    orchestrate: `${npx} ${cliArgs.join(" ")}`,
    hoist: `move ${appName}/* → cwd`,
    overlay: [MANIFEST_FILENAME],
    modules:
      starter === "topology-b"
        ? ["modules/main", ".rn/dev-session.jsonc", ".rn/host-profile.jsonc"]
        : [".rn/host-profile.jsonc (inline-main)"],
    demo: options.demo ? "rn demo add" : null,
    expects: ["package.json", "ios/", "android/"],
    rnExactTuple: rnExactTuplePreview,
    npmPolicy: npm.policy,
    npmPolicySource: npm.policySource,
    npmRegistry: npm.registry ?? null,
    npmRegistrySource: npm.registrySource,
    notes: [
      starter === "topology-b"
        ? "Default starter=topology-b: shell App + modules/main (ADR-005 industrial GF)."
        : "starter=inline-main: Community App stays in-tree (onboarding path A only).",
      "Hermes V1 + New Architecture are defaults on RN 0.87.x (no legacy arch).",
      "HarmonyOS is contract-reserved; A1 template targets ios+android only.",
      "Pods are skipped at init; run pod install on darwin before iOS device runs.",
      "Community CLI cannot init into cwd via absolute --directory; we stage then hoist.",
      npm.policy === "inherit"
        ? "npm policy=inherit uses your ~/.npmrc / npm_config_* (mainstream). Use --isolated-npmrc for CI/clean public fetch."
        : "npm policy=isolated ignores ~/.npmrc; forces a clean registry (CI / noisy global npm configs).",
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
    options.logger.writeHuman(`  starter: ${starter} (${plan.topology})`);
    options.logger.writeHuman(
      `  RN train: ${RN_GREENFIELD_MAJOR_MINOR}.x (pin ${RN_GREENFIELD_INIT_VERSION})`,
    );
    options.logger.writeHuman(`  orchestrate: ${plan.orchestrate}`);
    options.logger.writeHuman(`  hoist: ${plan.hoist}`);
    options.logger.writeHuman(`  overlay: ${MANIFEST_FILENAME}`);
    if (options.demo) {
      options.logger.writeHuman("  demo: rn demo add (after init)");
    }
    options.logger.writeHuman(`  rnExactTuple (preview): ${rnExactTuplePreview}`);
    options.logger.writeHuman(`  ${formatNpmPolicyLine(npm)}`);
    if (npm.policy === "isolated" && npmConfigKeyCount > 0) {
      options.logger.writeHuman(
        `  note: isolation will drop ${npmConfigKeyCount} npm_config_* env key(s) from this shell`,
      );
    }
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
  const child = buildNpmChildEnv(npm, { CI: "1" });
  const code = await runStreaming(npx, cliArgs, {
    cwd,
    replaceEnv: child.replaceEnv,
    env: child.env,
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

  if (starter === "topology-b") {
    const applied = applyTopologyBAfterInit(cwd);
    options.logger.writeHuman(
      `topology B: ${path.relative(cwd, applied.moduleRoot)} + shell ${path.basename(applied.appEntry)}`,
    );
  } else {
    mkdirSync(path.join(cwd, ".rn"), { recursive: true });
    writeFileSync(
      path.join(cwd, ".rn", "host-profile.jsonc"),
      `// GF inline-main starter (ADR-005 path A — onboarding only)\n${JSON.stringify(
        {
          schemaVersion: 1,
          profile: "greenfield",
          topology: "inline-main",
          devSessionProtocolVersion: 1,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  const tuple = buildRnExactTuple(rnVersion);
  if (options.logger.json) {
    options.logger.writeMachine({
      ok: true,
      projectRoot: cwd,
      rnVersion,
      rnExactTuple: tuple,
      manifest: MANIFEST_FILENAME,
      starter,
      topology: plan.topology,
    });
  } else {
    options.logger.writeHuman(`Project root: ${cwd}`);
    options.logger.writeHuman(
      `Wrote ${path.join(cwd, MANIFEST_FILENAME)} (rnExactTuple=${tuple})`,
    );
    options.logger.writeHuman(
      "Next: rn doctor → rn dev → rn-delivery build --platform android",
    );
    options.logger.writeHuman(
      "Android device testing needs ANDROID_HOME + adb (platform-tools). iOS needs Xcode + pod install.",
    );
  }

  if (options.demo) {
    await runDemoAdd({ cwd, logger: options.logger });
  }
}
