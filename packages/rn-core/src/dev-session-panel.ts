/**
 * Dev Session panel row state machine (catalog ∩ live ∩ probe).
 * bindable_metro = in_catalog ∧ live_present ∧ probe_ok ∧ !stale
 *
 * Catalog? ──no──► HIDDEN | LOCKED
 * Live?    ──no──► OFFLINE
 * probeOk? ──no──► STALE
 * else LIVE
 */
import type { LiveRecord } from "./live-types.js";
import { isLiveBindable } from "./live-types.js";

export type DevSessionPanelState =
  | "HIDDEN"
  | "LOCKED"
  | "OFFLINE"
  | "STALE"
  | "LIVE";

export type DevSessionPanelRowInput = {
  moduleId: string;
  /** Module appears in Catalog (or embedded snapshot). */
  inCatalog: boolean;
  /**
   * When not in catalog: HIDDEN (default) vs LOCKED (visible but cannot bind).
   * Host chooses LOCKED for "已知但未 publish" operator UX.
   */
  notInCatalogMode?: "HIDDEN" | "LOCKED";
  /** Live projection from Broker Pull/Push (undefined = no live). */
  live?: Pick<LiveRecord, "probeOk" | "stale"> | null;
};

export type DevSessionPanelRow = {
  moduleId: string;
  state: DevSessionPanelState;
  /** One-click Metro bind allowed only for LIVE. */
  bindableMetro: boolean;
};

export function resolveDevSessionPanelRow(
  input: DevSessionPanelRowInput,
): DevSessionPanelRow {
  if (!input.inCatalog) {
    const state = input.notInCatalogMode ?? "HIDDEN";
    return { moduleId: input.moduleId, state, bindableMetro: false };
  }

  const live = input.live;
  if (!live) {
    return {
      moduleId: input.moduleId,
      state: "OFFLINE",
      bindableMetro: false,
    };
  }

  if (!live.probeOk || live.stale === true) {
    return {
      moduleId: input.moduleId,
      state: "STALE",
      bindableMetro: false,
    };
  }

  const bindableMetro = isLiveBindable({
    moduleId: input.moduleId,
    usbUrl: "",
    heartbeatAt: new Date().toISOString(),
    probeOk: live.probeOk,
    stale: live.stale,
  });

  return {
    moduleId: input.moduleId,
    state: "LIVE",
    bindableMetro,
  };
}

/**
 * Build panel rows for all catalog modules + optional orphan live (LOCKED/HIDDEN).
 */
export function buildDevSessionPanelRows(options: {
  catalogModuleIds: readonly string[];
  liveByModuleId: ReadonlyMap<
    string,
    Pick<LiveRecord, "probeOk" | "stale">
  >;
  notInCatalogMode?: "HIDDEN" | "LOCKED";
  /** Live moduleIds not in catalog — emit LOCKED/HIDDEN rows when true. */
  includeOrphanLive?: boolean;
}): DevSessionPanelRow[] {
  const catalog = new Set(options.catalogModuleIds);
  const rows: DevSessionPanelRow[] = [];

  for (const id of options.catalogModuleIds) {
    rows.push(
      resolveDevSessionPanelRow({
        moduleId: id,
        inCatalog: true,
        live: options.liveByModuleId.get(id) ?? null,
      }),
    );
  }

  if (options.includeOrphanLive) {
    for (const id of options.liveByModuleId.keys()) {
      if (catalog.has(id)) continue;
      rows.push(
        resolveDevSessionPanelRow({
          moduleId: id,
          inCatalog: false,
          notInCatalogMode: options.notInCatalogMode ?? "LOCKED",
          live: options.liveByModuleId.get(id),
        }),
      );
    }
  }

  return rows;
}
