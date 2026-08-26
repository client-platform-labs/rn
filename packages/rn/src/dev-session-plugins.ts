/**
 * Load `kind: "dev-session"` plugins and materialize debug contributions.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildContributionsFile,
  createContributionRegistry,
  discoverPlugins,
  type DevSessionContributionsFile,
  type DevSessionMenuContribution,
  type DevSessionPluginRegister,
  type Logger,
} from "@client-platform/rn-core";

import { DEV_SUPPORT_MODULE_DIR } from "./dev-support/constants.js";

export const DEV_SESSION_CONTRIBUTIONS_FILE = "contributions.json";

export function contributionsPath(projectRoot: string): string {
  return path.join(projectRoot, DEV_SUPPORT_MODULE_DIR, DEV_SESSION_CONTRIBUTIONS_FILE);
}

export async function collectDevSessionMenuItems(options: {
  cwd: string;
  logger?: Logger;
}): Promise<DevSessionMenuContribution[]> {
  const logger = options.logger ?? {
    info: () => {},
    warn: () => {},
  };
  const plugins = await discoverPlugins({
    cwd: options.cwd,
    onWarn: (message) => logger.warn(message),
  });
  const menuItems: DevSessionMenuContribution[] = [];

  for (const record of plugins) {
    if (record.kind !== "dev-session") {
      continue;
    }
    const entry = path.resolve(record.packageRoot, record.export);
    try {
      const mod = (await import(pathToFileURL(entry).href)) as {
        default?: DevSessionPluginRegister;
      };
      if (typeof mod.default !== "function") {
        logger.warn(`plugin ${record.id}: default export is not register(ctx)`);
        continue;
      }
      const { ctx, menuItems: items } = createContributionRegistry(record.id);
      mod.default(ctx);
      menuItems.push(...items);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn(`plugin ${record.id}: failed to load ${record.export}: ${detail}`);
    }
  }

  return menuItems;
}

export async function writeDevSessionContributions(
  projectRoot: string,
  options?: { cwd?: string; logger?: Logger },
): Promise<DevSessionContributionsFile | null> {
  const menuItems = await collectDevSessionMenuItems({
    cwd: options?.cwd ?? projectRoot,
    logger: options?.logger,
  });
  if (menuItems.length === 0) {
    return null;
  }
  const file = buildContributionsFile(menuItems);
  const out = contributionsPath(projectRoot);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return file;
}

export function removeDevSessionContributions(projectRoot: string): void {
  const out = contributionsPath(projectRoot);
  if (existsSync(out)) {
    rmSync(out, { force: true });
  }
}
