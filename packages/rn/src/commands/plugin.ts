import { discoverPlugins } from "@client-platform/rn-core";
import type { CliLogger } from "../logger.js";

export async function runPluginList(options: {
  cwd: string;
  logger: CliLogger;
}): Promise<void> {
  const plugins = await discoverPlugins({
    cwd: options.cwd,
    onWarn: (message) => options.logger.warn(message),
  });

  if (options.logger.json) {
    options.logger.writeMachine({ plugins });
    return;
  }

  if (plugins.length === 0) {
    options.logger.writeHuman("No plugins discovered.");
    return;
  }

  for (const plugin of plugins) {
    options.logger.writeHuman(
      `${plugin.id}\t${plugin.kind}\tapiVersion=${plugin.apiVersion}\t${plugin.packageName}`,
    );
  }
}
