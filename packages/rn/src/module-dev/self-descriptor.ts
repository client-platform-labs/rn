/**
 * Business-module Self-Descriptor (`client-platform.module.jsonc`).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const MODULE_SELF_DESCRIPTOR_FILENAME = "client-platform.module.jsonc";

export type ModuleSelfDescriptor = {
  schemaVersion: number;
  business_module: string;
  productApp?: string;
  preferredMetroPort?: number;
};

/** Strip // line comments — same minimal JSONC reader as dev-session-config. */
function parseJsoncLoose(raw: string): unknown {
  const json = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return JSON.parse(json) as unknown;
}

export function loadModuleSelfDescriptor(
  cwd: string,
): ModuleSelfDescriptor | null {
  const file = path.join(cwd, MODULE_SELF_DESCRIPTOR_FILENAME);
  if (!existsSync(file)) return null;
  const parsed = parseJsoncLoose(readFileSync(file, "utf8"));
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.business_module !== "string" || !o.business_module.trim()) {
    return null;
  }
  return {
    schemaVersion: typeof o.schemaVersion === "number" ? o.schemaVersion : 1,
    business_module: o.business_module.trim(),
    productApp:
      typeof o.productApp === "string" ? o.productApp.trim() : undefined,
    preferredMetroPort:
      typeof o.preferredMetroPort === "number"
        ? o.preferredMetroPort
        : undefined,
  };
}
