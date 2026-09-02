/**
 * `rn module init|link|dev` — business_module workspaces (ADR-005 topology B).
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
} from "../module-workspace.js";
import { runModuleDev as runModuleDevOrchestration } from "../module-dev/orchestrate.js";

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
  dryRun?: boolean;
}): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  assertRnProject(projectRoot);
  assertModuleId(options.moduleId);

  const dest = moduleWorkspaceRoot(projectRoot, options.moduleId);
  if (!existsSync(dest)) {
    throw new CliError(
      `module workspace missing: ${MODULES_DIR}/${options.moduleId} — run rn module init ${options.moduleId}`,
      EXIT_FAIL,
    );
  }

  if (options.dryRun) {
    options.logger.writeHuman("module link plan (dry-run):");
    options.logger.writeHuman(
      `  link: ${options.moduleId} → .rn/dev-session.jsonc` +
        (options.metroPort ? ` port=${options.metroPort}` : ""),
    );
    return;
  }

  const config = linkModuleToDevSession({
    projectRoot,
    moduleId: options.moduleId,
    metroPort: options.metroPort,
    entry: options.entry,
  });
  const port = config.modules[options.moduleId]?.metroPort;
  options.logger.writeHuman(
    `Linked ${options.moduleId} → Metro :${port} (entry=${config.modules[options.moduleId]?.entry})`,
  );
}

/** Business cwd: Broker + Live + Metro (handbook §3). */
export async function runModuleDev(options: {
  cwd: string;
  logger: CliLogger;
  brokerHost?: string;
  brokerPort?: number;
  catalogBaseUrl?: string;
}): Promise<void> {
  const result = await runModuleDevOrchestration({
    cwd: path.resolve(options.cwd),
    logger: options.logger,
    brokerHost: options.brokerHost,
    brokerPort: options.brokerPort,
    catalogBaseUrl: options.catalogBaseUrl,
  });
  options.logger.writeHuman(
    `Done: ${result.moduleId} live at ${result.metro.usbUrl} (pull ${result.hostPullUrl})`,
  );
}
