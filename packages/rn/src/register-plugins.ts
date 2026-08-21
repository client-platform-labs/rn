import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Command } from "commander";
import {
  discoverPlugins,
  type Logger,
  type PluginRecord,
} from "@client-platform/rn-core";

export async function registerCliCommandPlugins(
  program: Command,
  logger: Logger,
  records?: PluginRecord[],
): Promise<void> {
  const plugins =
    records ??
    (await discoverPlugins({
      cwd: process.cwd(),
      onWarn: (message) => logger.warn(message),
    }));

  for (const record of plugins) {
    if (record.kind !== "cli-command") {
      continue;
    }
    const entry = path.resolve(record.packageRoot, record.export);
    try {
      const mod = (await import(pathToFileURL(entry).href)) as {
        default?: unknown;
      };
      if (typeof mod.default !== "function") {
        logger.warn(`plugin ${record.id}: default export is not register(ctx)`);
        continue;
      }
      (mod.default as (ctx: { program: Command; logger: Logger }) => void)({
        program,
        logger,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn(`plugin ${record.id}: failed to load ${record.export}: ${detail}`);
    }
  }
}
