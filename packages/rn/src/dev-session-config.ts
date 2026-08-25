import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  defaultDualModuleDevSession,
  type DevSessionConfig,
} from "@client-platform/rn-core";

/** Project-level multi-Metro + L-C config (ticket #17). */
export const DEV_SESSION_RELATIVE = path.join(".rn", "dev-session.jsonc");

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
  return file;
}

export function removeDevSessionConfig(projectRoot: string): void {
  const file = devSessionPath(projectRoot);
  if (existsSync(file)) {
    rmSync(file, { force: true });
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
  return JSON.parse(json) as DevSessionConfig;
}

export function ensureSampleDualModuleSession(projectRoot: string): string {
  return writeDevSessionConfig(projectRoot, defaultDualModuleDevSession());
}

export function listModulePorts(
  config: DevSessionConfig,
  moduleIds?: string[],
): Array<{ id: string; port: number }> {
  const ids = moduleIds?.length ? moduleIds : Object.keys(config.modules);
  return ids.map((id) => {
    const binding = config.modules[id];
    if (!binding) {
      throw new Error(`module "${id}" not in ${DEV_SESSION_RELATIVE}`);
    }
    return { id, port: binding.metroPort };
  });
}
