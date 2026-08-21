import {
  findManifestRoot,
  loadProjectManifest,
  MANIFEST_FILENAME,
} from "@client-platform/rn-core";
import { CliError, EXIT_FAIL, EXIT_USAGE } from "../errors.js";
import type { CliLogger } from "../logger.js";

export function runConfigValidate(options: {
  cwd: string;
  logger: CliLogger;
}): void {
  const root = findManifestRoot(options.cwd);
  if (!root) {
    throw new CliError(`missing ${MANIFEST_FILENAME}`, EXIT_USAGE);
  }

  const result = loadProjectManifest(root);
  if (!result.ok) {
    if (result.code === "not-found") {
      throw new CliError(`missing ${MANIFEST_FILENAME}`, EXIT_USAGE);
    }
    if (options.logger.json) {
      options.logger.writeMachine({
        ok: false,
        path: result.path,
        errors: result.errors,
      });
    }
    throw new CliError(result.errors.join("\n"), EXIT_FAIL);
  }

  if (options.logger.json) {
    options.logger.writeMachine({
      ok: true,
      path: result.path,
      schemaVersion: result.manifest.schemaVersion,
    });
    return;
  }

  options.logger.writeHuman(
    `${result.path}: ok (schemaVersion=${result.manifest.schemaVersion})`,
  );
}
