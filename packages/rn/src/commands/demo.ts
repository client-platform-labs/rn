import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { CliError, EXIT_FAIL } from "../errors.js";
import type { CliLogger } from "../logger.js";
import { runStreaming } from "../process.js";
import {
  ensureSampleDualModuleSession,
  removeDevSessionConfig,
} from "../dev-session-config.js";
import {
  DEMO_APP_ENTRY_WIRE,
  DEMO_INDEX_GESTURE_IMPORT,
  DEMO_NPM_DEPS,
  DEMO_SAMPLE_DIR,
  DEMO_STATE_DIR,
  DEMO_STATE_FILE,
} from "../demo/constants.js";
import { patchNativeProject } from "../demo/native-patch.js";
import { resolveSampleDemoTemplateDir } from "../demo/template.js";

export interface DemoState {
  version: 1;
  appEntry: string;
  backedUp: string[];
}

function findAppEntry(projectRoot: string): string {
  for (const name of ["App.tsx", "App.jsx"]) {
    const p = path.join(projectRoot, name);
    if (existsSync(p)) {
      return name;
    }
  }
  throw new CliError(
    "App.tsx / App.jsx not found — run from a React Native project root",
    EXIT_FAIL,
  );
}

function ensureGestureHandlerImport(
  projectRoot: string,
  backedUp: string[],
): boolean {
  const indexPath = path.join(projectRoot, "index.js");
  if (!existsSync(indexPath)) {
    return false;
  }
  const raw = readFileSync(indexPath, "utf8");
  if (raw.includes("react-native-gesture-handler")) {
    return false;
  }
  backupFile(projectRoot, "index.js", backedUp);
  writeFileSync(indexPath, `${DEMO_INDEX_GESTURE_IMPORT}${raw}`, "utf8");
  return true;
}

function assertReactNativeProject(projectRoot: string): void {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) {
    throw new CliError("package.json not found", EXIT_FAIL);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  if (!pkg.dependencies?.["react-native"]) {
    throw new CliError("not a React Native project (missing react-native dependency)", EXIT_FAIL);
  }
}

function demoStatePath(projectRoot: string): string {
  return path.join(projectRoot, DEMO_STATE_DIR, DEMO_STATE_FILE);
}

function isDemoPresent(projectRoot: string): boolean {
  return existsSync(demoStatePath(projectRoot));
}

function backupPath(projectRoot: string, relative: string): string {
  return path.join(projectRoot, DEMO_STATE_DIR, "backup", relative);
}

function copyRecursive(src: string, dest: string): void {
  cpSync(src, dest, { recursive: true });
}

function backupFile(projectRoot: string, relative: string, backedUp: string[]): void {
  const src = path.join(projectRoot, relative);
  if (!existsSync(src)) {
    return;
  }
  const dest = backupPath(projectRoot, relative);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest);
  backedUp.push(relative);
}

function restoreBackedUp(projectRoot: string, state: DemoState): void {
  for (const relative of state.backedUp) {
    const from = backupPath(projectRoot, relative);
    const to = path.join(projectRoot, relative);
    if (!existsSync(from)) {
      continue;
    }
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to);
  }
}

async function installDemoDeps(
  projectRoot: string,
  logger: CliLogger,
): Promise<void> {
  logger.info(`Installing sample navigation deps: ${DEMO_NPM_DEPS.join(" ")}`);
  const code = await runStreaming(
    "npm",
    ["install", ...DEMO_NPM_DEPS, "--no-fund", "--no-audit", "--loglevel=error"],
    { cwd: projectRoot },
  );
  if (code !== 0) {
    throw new CliError(`npm install failed (exit ${code})`, EXIT_FAIL);
  }
}

async function removeDemoDeps(
  projectRoot: string,
  logger: CliLogger,
): Promise<void> {
  logger.info("Removing sample navigation deps…");
  const code = await runStreaming(
    "npm",
    ["uninstall", ...DEMO_NPM_DEPS, "--no-fund", "--no-audit", "--loglevel=error"],
    { cwd: projectRoot },
  );
  if (code !== 0) {
    logger.warn(`npm uninstall returned exit ${code} (continuing)`);
  }
}

export async function runDemoAdd(options: {
  cwd: string;
  logger: CliLogger;
  dryRun?: boolean;
}): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  assertReactNativeProject(projectRoot);

  if (isDemoPresent(projectRoot)) {
    throw new CliError(
      "sample demo already present — run `rn demo remove` first",
      EXIT_FAIL,
    );
  }

  const appEntry = findAppEntry(projectRoot);
  const templateDir = resolveSampleDemoTemplateDir();
  const sampleDest = path.join(projectRoot, DEMO_SAMPLE_DIR);

  if (options.dryRun) {
    options.logger.writeHuman("demo add plan (dry-run):");
    options.logger.writeHuman(`  copy: ${templateDir}/src/sample → ${sampleDest}`);
    options.logger.writeHuman(`  wire: ${appEntry} → SampleApp`);
    options.logger.writeHuman(`  npm install: ${DEMO_NPM_DEPS.join(" ")}`);
    options.logger.writeHuman("  patch: AndroidManifest.xml + Info.plist (permissions + cpl-sample scheme)");
    return;
  }

  const backedUp: string[] = [];
  backupFile(projectRoot, appEntry, backedUp);
  ensureGestureHandlerImport(projectRoot, backedUp);

  const androidManifest = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "AndroidManifest.xml",
  );
  if (existsSync(androidManifest)) {
    backupFile(
      projectRoot,
      path.relative(projectRoot, androidManifest),
      backedUp,
    );
  }

  const iosDir = path.join(projectRoot, "ios");
  if (existsSync(iosDir)) {
    for (const entry of readdirSync(iosDir)) {
      const plist = path.join(iosDir, entry, "Info.plist");
      if (existsSync(plist)) {
        backupFile(projectRoot, path.relative(projectRoot, plist), backedUp);
        break;
      }
    }
  }

  copyRecursive(path.join(templateDir, "src", "sample"), sampleDest);
  writeFileSync(path.join(projectRoot, appEntry), DEMO_APP_ENTRY_WIRE, "utf8");

  const sessionFile = ensureSampleDualModuleSession(projectRoot);

  patchNativeProject(projectRoot, "add");

  await installDemoDeps(projectRoot, options.logger);

  const state: DemoState = {
    version: 1,
    appEntry,
    backedUp,
  };
  mkdirSync(path.join(projectRoot, DEMO_STATE_DIR), { recursive: true });
  writeFileSync(demoStatePath(projectRoot), JSON.stringify(state, null, 2), "utf8");

  options.logger.writeHuman("Sample demo added.");
  options.logger.writeHuman(`  code: ${DEMO_SAMPLE_DIR}/`);
  options.logger.writeHuman(`  entry: ${appEntry} → SampleApp`);
  options.logger.writeHuman(`  multi-module: ${sessionFile}`);
  options.logger.writeHuman("  remove: rn demo remove");
  options.logger.writeHuman("Next: rn dev --android");
  options.logger.writeHuman("  optional: rn dev --modules main,support");
  options.logger.writeHuman("  optional: rn dev-support add  (debug FAB → Dev Menu)");
}

export async function runDemoRemove(options: {
  cwd: string;
  logger: CliLogger;
  dryRun?: boolean;
}): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  const stateFile = demoStatePath(projectRoot);

  if (!existsSync(stateFile)) {
    throw new CliError("sample demo not present (no .rn-demo/state.json)", EXIT_FAIL);
  }

  const state = JSON.parse(readFileSync(stateFile, "utf8")) as DemoState;

  if (options.dryRun) {
    options.logger.writeHuman("demo remove plan (dry-run):");
    options.logger.writeHuman(`  restore: ${state.backedUp.join(", ")}`);
    options.logger.writeHuman(`  delete: ${DEMO_SAMPLE_DIR}/`);
    options.logger.writeHuman(`  delete: ${DEMO_STATE_DIR}/`);
    options.logger.writeHuman("  delete: .rn/dev-session.jsonc");
    return;
  }

  restoreBackedUp(projectRoot, state);

  const sampleDir = path.join(projectRoot, DEMO_SAMPLE_DIR);
  if (existsSync(sampleDir)) {
    rmSync(sampleDir, { recursive: true, force: true });
  }

  removeDevSessionConfig(projectRoot);

  await removeDemoDeps(projectRoot, options.logger);

  rmSync(path.join(projectRoot, DEMO_STATE_DIR), { recursive: true, force: true });

  options.logger.writeHuman("Sample demo removed — upstream Hello entry restored.");
}
