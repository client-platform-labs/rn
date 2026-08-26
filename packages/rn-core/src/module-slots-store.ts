/**
 * Per-module device slot persistence (A5 / ADR-004).
 * File plane only — not a shippable release artifact.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ModuleSlots } from "./types.js";

export const MODULE_SLOTS_DIR = ".rn/runtime/slots";

export function moduleSlotsPath(
  projectRoot: string,
  businessModule: string,
): string {
  const safe = businessModule.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(path.resolve(projectRoot), MODULE_SLOTS_DIR, `${safe}.json`);
}

export type LoadModuleSlotsResult =
  | { ok: true; slots: ModuleSlots; path: string }
  | { ok: false; reason: string; path: string };

/**
 * Load persisted slots for one business_module.
 * Missing file → ok:false (host should seed baseline from the shell).
 */
export function loadModuleSlots(
  projectRoot: string,
  businessModule: string,
): LoadModuleSlotsResult {
  const filePath = moduleSlotsPath(projectRoot, businessModule);
  if (!existsSync(filePath)) {
    return {
      ok: false,
      reason: `no slots file for ${businessModule}`,
      path: filePath,
    };
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as ModuleSlots;
    if (
      typeof raw?.business_module !== "string" ||
      raw.baseline == null ||
      typeof raw.baseline.update_id !== "string"
    ) {
      return {
        ok: false,
        reason: "slots JSON missing business_module or baseline",
        path: filePath,
      };
    }
    if (raw.business_module !== businessModule) {
      return {
        ok: false,
        reason: `file business_module "${raw.business_module}" != "${businessModule}"`,
        path: filePath,
      };
    }
    return { ok: true, slots: raw, path: filePath };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      path: filePath,
    };
  }
}

/** Persist slots after promote / rollback / baseline seed. */
export function saveModuleSlots(
  projectRoot: string,
  slots: ModuleSlots,
): { path: string } {
  const filePath = moduleSlotsPath(projectRoot, slots.business_module);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(slots, null, 2)}\n`, "utf8");
  return { path: filePath };
}
