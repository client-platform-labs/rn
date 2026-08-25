import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { CliError, EXIT_FAIL } from "../errors.js";
import type { CliLogger } from "../logger.js";
import {
  DEV_SUPPORT_MODULE_DIR,
  DEV_SUPPORT_STATE_DIR,
  DEV_SUPPORT_STATE_FILE,
} from "../dev-support/constants.js";
import { resolveDevSupportTemplateFile } from "../dev-support/template.js";

export interface DevSupportState {
  version: 1;
  appEntry: string;
  previousAppContent: string;
}

function findAppEntry(projectRoot: string): string {
  for (const name of ["App.tsx", "App.jsx"]) {
    const p = path.join(projectRoot, name);
    if (existsSync(p)) {
      return name;
    }
  }
  throw new CliError("App.tsx / App.jsx not found", EXIT_FAIL);
}

function statePath(projectRoot: string): string {
  return path.join(projectRoot, DEV_SUPPORT_STATE_DIR, DEV_SUPPORT_STATE_FILE);
}

function buildWrappedApp(innerImport: string, innerIdentifier: string): string {
  return `/**
 * Wrapped by \`rn dev-support add\` — restore with \`rn dev-support remove\`.
 */
import { DevSupportRoot } from './${DEV_SUPPORT_MODULE_DIR}/DevSupportRoot';
${innerImport}

export default function App() {
  return (
    <DevSupportRoot>
      <${innerIdentifier} />
    </DevSupportRoot>
  );
}
`;
}

function parseDefaultExport(content: string): { importLine: string; identifier: string } | undefined {
  if (content.includes("export default function")) {
    const m = content.match(/export default function (\w+)/);
    if (m?.[1]) {
      return { importLine: "", identifier: m[1] };
    }
  }
  const defaultImport = content.match(/import (\w+) from ['"]([^'"]+)['"]/);
  if (defaultImport?.[1]) {
    return {
      importLine: defaultImport[0],
      identifier: defaultImport[1],
    };
  }
  return undefined;
}

export async function runDevSupportAdd(options: {
  cwd: string;
  logger: CliLogger;
  dryRun?: boolean;
}): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  if (existsSync(statePath(projectRoot))) {
    throw new CliError("dev-support already enabled — run `rn dev-support remove` first", EXIT_FAIL);
  }

  const appEntry = findAppEntry(projectRoot);
  const appPath = path.join(projectRoot, appEntry);
  const previous = readFileSync(appPath, "utf8");
  const parsed = parseDefaultExport(previous);
  if (!parsed) {
    throw new CliError(
      "Could not parse App entry — expected `export default function` or `import X from ...; export default X`",
      EXIT_FAIL,
    );
  }

  if (options.dryRun) {
    options.logger.writeHuman("dev-support add plan (dry-run):");
    options.logger.writeHuman(`  copy: DevSupportRoot.tsx → ${DEV_SUPPORT_MODULE_DIR}/`);
    options.logger.writeHuman(`  wrap: ${appEntry} with DevSupportRoot`);
    return;
  }

  const moduleDir = path.join(projectRoot, DEV_SUPPORT_MODULE_DIR);
  mkdirSync(moduleDir, { recursive: true });
  cpSync(resolveDevSupportTemplateFile(), path.join(moduleDir, "DevSupportRoot.tsx"));

  const wrapped = buildWrappedApp(parsed.importLine, parsed.identifier);
  writeFileSync(appPath, wrapped, "utf8");

  const state: DevSupportState = {
    version: 1,
    appEntry,
    previousAppContent: previous,
  };
  mkdirSync(path.join(projectRoot, DEV_SUPPORT_STATE_DIR), { recursive: true });
  writeFileSync(statePath(projectRoot), JSON.stringify(state, null, 2), "utf8");

  options.logger.writeHuman("Dev support enabled (debug FAB → RN Dev Menu).");
  options.logger.writeHuman(`  module: ${DEV_SUPPORT_MODULE_DIR}/`);
  options.logger.writeHuman("  remove: rn dev-support remove");
}

export async function runDevSupportRemove(options: {
  cwd: string;
  logger: CliLogger;
  dryRun?: boolean;
}): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  const sp = statePath(projectRoot);
  if (!existsSync(sp)) {
    throw new CliError("dev-support not enabled", EXIT_FAIL);
  }

  const state = JSON.parse(readFileSync(sp, "utf8")) as DevSupportState;

  if (options.dryRun) {
    options.logger.writeHuman("dev-support remove plan (dry-run):");
    options.logger.writeHuman(`  restore: ${state.appEntry}`);
    options.logger.writeHuman(`  delete: ${DEV_SUPPORT_MODULE_DIR}/`);
    return;
  }

  writeFileSync(path.join(projectRoot, state.appEntry), state.previousAppContent, "utf8");

  const moduleDir = path.join(projectRoot, DEV_SUPPORT_MODULE_DIR);
  if (existsSync(moduleDir)) {
    rmSync(moduleDir, { recursive: true, force: true });
  }
  rmSync(path.join(projectRoot, DEV_SUPPORT_STATE_DIR), { recursive: true, force: true });

  options.logger.writeHuman("Dev support removed — App entry restored.");
}
