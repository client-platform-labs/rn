/**
 * On-device module slot path helpers (ported from tiangong-host shell/ota/slotPaths).
 * Layout: `ota/<moduleId>/{staged,active,baseline}/`.
 */

export const DEFAULT_MODULE_ID = "main";

const MODULE_ID_RE = /^[a-z][a-z0-9_-]{1,63}$/;

export function assertModuleId(moduleId: string): string {
  if (!MODULE_ID_RE.test(moduleId)) {
    throw new Error(`invalid moduleId: ${moduleId}`);
  }
  return moduleId;
}

export function moduleSlotRel(
  moduleId: string,
  slot: "staged" | "active" | "baseline",
): string {
  assertModuleId(moduleId);
  return `ota/${moduleId}/${slot}`;
}

export function assetBaselineUri(moduleId: string): string {
  assertModuleId(moduleId);
  return `assets://ota/${moduleId}/index.hbc`;
}