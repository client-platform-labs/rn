import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  defaultDualModuleDevSession,
  negotiateDevSessionProtocol,
  resolveDevSessionProtocolVersion,
  type DevSessionConfig,
} from "@client-platform/rn-core";

import { CliError, EXIT_FAIL } from "./errors.js";

import {
  removeMetroModuleConfigs,
  writeMetroModuleConfigs,
  metroModuleConfigPath,
} from "./metro-module-config.js";

/** Project-level multi-Metro + L-C config (ticket #17). */
export const DEV_SESSION_RELATIVE = path.join(".rn", "dev-session.jsonc");
export const SUPPORT_ENTRY_FILE = "index.support.js";

export function devSessionPath(projectRoot: string): string {
  return path.join(projectRoot, DEV_SESSION_RELATIVE);
}

export function writeDevSessionConfig(
  projectRoot: string,
  config: DevSessionConfig,
): string {
  const file = devSessionPath(projectRoot);
  mkdirSync(path.dirname(file), { recursive: true });
  const body =
    "// Generated / maintained for rn multi-module Dev Session (map-a/#17)\n" +
    "// Removable with sample demo: rn demo remove\n" +
    JSON.stringify(config, null, 2) +
    "\n";
  writeFileSync(file, body, "utf8");
  writeMetroModuleConfigs(projectRoot, config);
  return file;
}

export function removeDevSessionConfig(projectRoot: string): void {
  const file = devSessionPath(projectRoot);
  if (existsSync(file)) {
    rmSync(file, { force: true });
  }
  removeMetroModuleConfigs(projectRoot);
  const supportEntry = path.join(projectRoot, SUPPORT_ENTRY_FILE);
  if (existsSync(supportEntry)) {
    rmSync(supportEntry, { force: true });
  }
}

/** Strip JSONC line comments for a minimal reader (no full JSONC parser). */
export function loadDevSessionConfig(projectRoot: string): DevSessionConfig | null {
  const file = devSessionPath(projectRoot);
  if (!existsSync(file)) {
    return null;
  }
  const raw = readFileSync(file, "utf8");
  const json = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const config = JSON.parse(json) as DevSessionConfig;
  const peer = resolveDevSessionProtocolVersion(config);
  const negotiated = negotiateDevSessionProtocol({ peer });
  if (!negotiated.ok) {
    throw new CliError(
      `${DEV_SESSION_RELATIVE}: ${negotiated.reason}`,
      EXIT_FAIL,
    );
  }
  return {
    ...config,
    devSessionProtocolVersion: negotiated.version,
  };
}

function readAppRegistryName(projectRoot: string): string {
  for (const name of ["app.json", "app.config.json"]) {
    const p = path.join(projectRoot, name);
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, "utf8")) as {
        name?: string;
      };
      if (j.name) return j.name;
    } catch {
      // ignore
    }
  }
  return "MyRnApp";
}

/** Write dual-module session + metro configs + support entry. */
export function ensureSampleDualModuleSession(projectRoot: string): string {
  const config = defaultDualModuleDevSession();
  const sessionFile = writeDevSessionConfig(projectRoot, config);
  const appKey = readAppRegistryName(projectRoot);
  const supportEntry = path.join(projectRoot, SUPPORT_ENTRY_FILE);
  writeFileSync(
    supportEntry,
    `/**
 * Second-module Metro entry (map-a/#17). Removed by \`rn demo remove\`.
 * Bundle: http://localhost:8082/index.support.bundle?platform=android
 */
import { registerSupportModule } from './src/sample/modules/SupportModuleApp';

registerSupportModule(${JSON.stringify(appKey)});
`,
    "utf8",
  );
  return sessionFile;
}

export function listModulePorts(
  config: DevSessionConfig,
  moduleIds?: string[],
  projectRoot?: string,
): Array<{ id: string; port: number; entry?: string; metroConfig?: string }> {
  const ids = moduleIds?.length ? moduleIds : Object.keys(config.modules);
  return ids.map((id) => {
    const binding = config.modules[id];
    if (!binding) {
      throw new Error(`module "${id}" not in ${DEV_SESSION_RELATIVE}`);
    }
    const metroConfig =
      projectRoot && existsSync(metroModuleConfigPath(projectRoot, id))
        ? metroModuleConfigPath(projectRoot, id)
        : undefined;
    return {
      id,
      port: binding.metroPort,
      entry: binding.entry,
      metroConfig,
    };
  });
}
