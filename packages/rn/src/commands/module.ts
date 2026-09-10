/**
 * `rn module init|link` — business_module workspaces (ADR-005 topology B).
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { CliError, EXIT_FAIL, EXIT_USAGE } from "../errors.js";
import type { CliLogger } from "../logger.js";
import {
  linkModuleToDevSession,
  MODULES_DIR,
  moduleWorkspaceRoot,
  scaffoldModuleWorkspace,
  writeModuleRegistry,
} from "../module-workspace.js";
import { loadDevSessionConfig } from "../dev-session-config.js";
import { writeHostMetroResolver } from "../host-metro-config.js";
import { writeGeneratedRuntime } from "../runtime-config.js";

const MODULE_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;

function assertModuleId(moduleId: string): void {
  if (!MODULE_ID_RE.test(moduleId)) {
    throw new CliError(
      `invalid module id ${JSON.stringify(moduleId)} — use /^[a-z][a-z0-9_-]{0,63}$/`,
      EXIT_USAGE,
    );
  }
}

function assertRnProject(cwd: string): void {
  if (!existsSync(path.join(cwd, "package.json"))) {
    throw new CliError("package.json not found — run from project root", EXIT_FAIL);
  }
}

export async function runModuleInit(options: {
  cwd: string;
  moduleId: string;
  logger: CliLogger;
  link?: boolean;
  metroPort?: number;
  dryRun?: boolean;
}): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  assertRnProject(projectRoot);
  assertModuleId(options.moduleId);

  const dest = moduleWorkspaceRoot(projectRoot, options.moduleId);
  if (options.dryRun) {
    options.logger.writeHuman("module init plan (dry-run):");
    options.logger.writeHuman(`  scaffold: ${MODULES_DIR}/${options.moduleId}/`);
    if (options.link) {
      options.logger.writeHuman(`  link: .rn/dev-session.jsonc ← ${options.moduleId}`);
    }
    return;
  }

  if (existsSync(dest)) {
    throw new CliError(
      `module workspace already exists: ${MODULES_DIR}/${options.moduleId}`,
      EXIT_FAIL,
    );
  }

  scaffoldModuleWorkspace({
    projectRoot,
    moduleId: options.moduleId,
  });
  options.logger.writeHuman(
    `Created ${MODULES_DIR}/${options.moduleId}/ (business_module workspace)`,
  );

  if (options.link !== false) {
    const config = linkModuleToDevSession({
      projectRoot,
      moduleId: options.moduleId,
      metroPort: options.metroPort,
    });
    const port = config.modules[options.moduleId]?.metroPort;
    options.logger.writeHuman(
      `Linked ${options.moduleId} → Metro :${port} in .rn/dev-session.jsonc`,
    );
  }
}

export async function runModuleLink(options: {
  cwd: string;
  moduleId: string;
  logger: CliLogger;
  metroPort?: number;
  entry?: string;
  /** Module repo path (sibling or in-repo); declared, never guessed. */
  moduleRoot?: string;
  dryRun?: boolean;
}): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  assertRnProject(projectRoot);
  assertModuleId(options.moduleId);

  const dest = options.moduleRoot
    ? path.resolve(options.moduleRoot)
    : moduleWorkspaceRoot(projectRoot, options.moduleId);
  if (!existsSync(dest)) {
    throw new CliError(
      `module root missing: ${dest} — pass --module-root <path>`,
      EXIT_FAIL,
    );
  }

  if (options.dryRun) {
    options.logger.writeHuman("module link plan (dry-run):");
    options.logger.writeHuman(`  module: ${options.moduleId} @ ${dest}`);
    return;
  }

  const config = linkModuleToDevSession({
    projectRoot,
    moduleId: options.moduleId,
    metroPort: options.metroPort,
    entry: options.entry,
    moduleRoot: dest,
  });
  const port = config.modules[options.moduleId]?.metroPort;
  options.logger.writeHuman(
    `Linked ${options.moduleId} → Metro :${port} (root=${dest}, entry=${config.modules[options.moduleId]?.entry})`,
  );
}

/** `rn module register` — regenerate the shell's generated registry (ADR-021/D2). */
export async function runModuleRegister(options: {
  cwd: string;
  logger: CliLogger;
  dryRun?: boolean;
}): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  assertRnProject(projectRoot);
  const config = loadDevSessionConfig(projectRoot);
  const modules = config
    ? Object.entries(config.modules).map(([moduleId, binding]) => ({
        moduleId,
        packageName: binding.packageName,
      }))
    : [];
  if (modules.length === 0) {
    throw new CliError(
      "no business modules registered — run rn module link <id> first",
      EXIT_FAIL,
    );
  }
  if (options.dryRun) {
    options.logger.writeHuman("module register plan (dry-run):");
    for (const m of modules) {
      options.logger.writeHuman(`  register: ${m.moduleId} (${m.packageName ?? "unscoped"})`);
    }
    return;
  }
  const file = writeModuleRegistry(projectRoot, modules);
  options.logger.writeHuman(
    `Wrote generated registry: ${path.relative(projectRoot, file)}`,
  );
  const resolver = writeHostMetroResolver(projectRoot);
  options.logger.writeHuman(
    `Wrote host Metro resolver: ${path.relative(projectRoot, resolver)}`,
  );
  // SEAM-2 (F13/F23): module register also regenerates the runtime config
  // derived artifact so declaration and derived artifacts stay in sync.
  const runtime = writeGeneratedRuntime(projectRoot);
  options.logger.writeHuman(
    `Wrote generated runtime: ${path.relative(projectRoot, runtime)}`,
  );
}
