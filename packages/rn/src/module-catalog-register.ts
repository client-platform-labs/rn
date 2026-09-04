/**
 * Unified host-ops flow: ensure module(s) in dev-session draft → publish Catalog SoT.
 * Replaces the user-visible two-step `link` → `register` chain (#160 / C4).
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { runCatalogPublish } from "./commands/catalog.js";
import { CliError, EXIT_FAIL, EXIT_USAGE } from "./errors.js";
import type { CliLogger } from "./logger.js";
import { loadDevSessionConfig } from "./dev-session-config.js";
import {
  linkModuleToDevSession,
  moduleWorkspaceRoot,
  MODULES_DIR,
} from "./module-workspace.js";
import { loadModuleSelfDescriptor } from "./module-dev/self-descriptor.js";

const MODULE_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;

function assertModuleId(moduleId: string): void {
  if (!MODULE_ID_RE.test(moduleId)) {
    throw new CliError(
      `invalid module id ${JSON.stringify(moduleId)} — use /^[a-z][a-z0-9_-]{0,63}$/`,
      EXIT_USAGE,
    );
  }
}

export type EnsureModuleResult = {
  moduleId: string;
  action: "already_linked" | "linked_from_workspace" | "linked_from_descriptor" | "dry_run";
  metroPort?: number;
  entry?: string;
};

/**
 * Idempotently ensure `moduleId` appears in `.rn/dev-session.jsonc`.
 * Does not publish — use {@link runModuleRegisterFlow} for the full host-ops job.
 */
export function ensureModuleInDevSession(options: {
  projectRoot: string;
  moduleId: string;
  logger: CliLogger;
  metroPort?: number;
  entry?: string;
  /** External business repo — reads `client-platform.module.jsonc`. */
  from?: string;
  dryRun?: boolean;
}): EnsureModuleResult {
  const projectRoot = path.resolve(options.projectRoot);
  assertModuleId(options.moduleId);

  const existing = loadDevSessionConfig(projectRoot);
  if (existing?.modules[options.moduleId] && !options.metroPort && !options.entry && !options.from) {
    const binding = existing.modules[options.moduleId]!;
    return {
      moduleId: options.moduleId,
      action: "already_linked",
      metroPort: binding.metroPort,
      entry: binding.entry,
    };
  }

  const workspace = moduleWorkspaceRoot(projectRoot, options.moduleId);
  if (existsSync(workspace)) {
    if (options.dryRun) {
      return { moduleId: options.moduleId, action: "dry_run" };
    }
    const config = linkModuleToDevSession({
      projectRoot,
      moduleId: options.moduleId,
      metroPort: options.metroPort,
      entry: options.entry,
    });
    const binding = config.modules[options.moduleId]!;
    return {
      moduleId: options.moduleId,
      action: "linked_from_workspace",
      metroPort: binding.metroPort,
      entry: binding.entry,
    };
  }

  if (options.from) {
    const fromRoot = path.resolve(options.from);
    const descriptor = loadModuleSelfDescriptor(fromRoot);
    if (!descriptor) {
      throw new CliError(
        `missing client-platform.module.jsonc in ${fromRoot}`,
        EXIT_FAIL,
      );
    }
    if (descriptor.business_module !== options.moduleId) {
      throw new CliError(
        `module id mismatch: CLI ${JSON.stringify(options.moduleId)} vs descriptor ${JSON.stringify(descriptor.business_module)} in ${fromRoot}`,
        EXIT_USAGE,
      );
    }
    if (options.dryRun) {
      return { moduleId: options.moduleId, action: "dry_run" };
    }
    const config = linkModuleToDevSession({
      projectRoot,
      moduleId: options.moduleId,
      metroPort: options.metroPort ?? descriptor.preferredMetroPort,
      entry: options.entry ?? "index",
    });
    const binding = config.modules[options.moduleId]!;
    return {
      moduleId: options.moduleId,
      action: "linked_from_descriptor",
      metroPort: binding.metroPort,
      entry: binding.entry,
    };
  }

  throw new CliError(
    `cannot register ${JSON.stringify(options.moduleId)}: no ${MODULES_DIR}/${options.moduleId}/ in shell workspace.\n` +
      `  Shell module: rn module init ${options.moduleId}\n` +
      `  External repo: rn module register ${options.moduleId} --from <businessRepo>`,
    EXIT_FAIL,
  );
}

/** Resolve module ids when user passes only `--from`. */
export function resolveRegisterModuleIds(options: {
  moduleIds: string[];
  from?: string;
}): { moduleIds: string[]; from?: string } {
  if (options.moduleIds.length > 0) {
    if (options.from && options.moduleIds.length > 1) {
      throw new CliError(
        "--from applies to a single external module; pass one moduleId or omit ids and use only --from",
        EXIT_USAGE,
      );
    }
    for (const id of options.moduleIds) {
      assertModuleId(id);
    }
    return { moduleIds: options.moduleIds, from: options.from };
  }
  if (options.from) {
    const descriptor = loadModuleSelfDescriptor(path.resolve(options.from));
    if (!descriptor) {
      throw new CliError(
        `missing client-platform.module.jsonc in ${path.resolve(options.from)}`,
        EXIT_FAIL,
      );
    }
    return {
      moduleIds: [descriptor.business_module],
      from: options.from,
    };
  }
  return { moduleIds: [] };
}

/**
 * Host-ops one job: ensure module(s) in dev-session (if requested) → publish Catalog.
 */
export async function runModuleRegisterFlow(
  options: {
    cwd: string;
    logger: CliLogger;
    moduleIds?: string[];
    from?: string;
    metroPort?: number;
    entry?: string;
    dryRun?: boolean;
    productApp?: string;
    catalogRoot?: string;
    embedOut?: string;
    noEmbed?: boolean;
  },
): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  const resolved = resolveRegisterModuleIds({
    moduleIds: options.moduleIds ?? [],
    from: options.from,
  });

  if (resolved.moduleIds.length > 0) {
    for (const moduleId of resolved.moduleIds) {
      const result = ensureModuleInDevSession({
        projectRoot,
        moduleId,
        logger: options.logger,
        metroPort: options.metroPort,
        entry: options.entry,
        from: resolved.from,
        dryRun: options.dryRun,
      });
      if (result.action === "dry_run") {
        options.logger.writeHuman(
          `register plan: ensure ${moduleId} in dev-session` +
            (resolved.from ? ` (from ${resolved.from})` : ""),
        );
        continue;
      }
      if (result.action === "already_linked") {
        options.logger.writeHuman(
          `dev-session: ${moduleId} already linked (:${result.metroPort})`,
        );
      } else {
        options.logger.writeHuman(
          `dev-session: linked ${moduleId} → Metro :${result.metroPort} (entry=${result.entry})`,
        );
      }
    }
    if (options.dryRun) {
      options.logger.writeHuman("register plan: publish catalog from dev-session");
      return;
    }
  } else if (!loadDevSessionConfig(projectRoot)) {
    throw new CliError(
      "no .rn/dev-session.jsonc — run: rn module register <id> [--from <repo>] or rn module init <id>",
      EXIT_FAIL,
    );
  }

  if (options.dryRun) {
    options.logger.writeHuman("register plan: publish catalog from dev-session");
    return;
  }

  await runCatalogPublish({
    cwd: projectRoot,
    logger: options.logger,
    productApp: options.productApp,
    catalogRoot: options.catalogRoot,
    embedOut: options.embedOut,
    noEmbed: options.noEmbed,
    actionVerb: "Registered",
  });
}
