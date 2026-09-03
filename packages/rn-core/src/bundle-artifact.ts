/**
 * Per-module bundle artifact contract (ADR-008 R4).
 *
 * Types + validation only — **no delivery implementation here**.
 * Industrial pack/sign/promote belongs in `rn-delivery` + control plane
 * (HBC release bundles, signed manifests, CDN). Dev Metro must not be
 * treated as a shippable artifact.
 */
export type ModuleBundleKind = "base" | "delta";

export type ModuleBundleArtifact = {
  business_module: string;
  kind: ModuleBundleKind;
  /** Content digest (sha256 hex) of the payload. */
  digest: string;
  /** Required when kind=delta — digest of the base this patch applies to. */
  base_digest?: string;
  /**
   * Optional (#141 peel MVP draft): digest of `base-module-id-map.json`
   * used when packing a peeled business bundle. Consumers (#126) may require
   * this when loading delta/peeled artifacts against a shared base.
   */
  module_id_map_digest?: string;
  update_id: string;
};

/** Metro dev response headers (module identity; not a delivery pipeline). */
export const MODULE_BUNDLE_HEADER = "X-RN-Business-Module";
export const MODULE_BUNDLE_KIND_HEADER = "X-RN-Bundle-Kind";

export function validateBundleArtifact(artifact: ModuleBundleArtifact): {
  ok: true;
} | { ok: false; reason: string } {
  if (!artifact.business_module.trim()) {
    return { ok: false, reason: "business_module required" };
  }
  if (!artifact.digest.trim()) {
    return { ok: false, reason: "digest required" };
  }
  if (!artifact.update_id.trim()) {
    return { ok: false, reason: "update_id required" };
  }
  if (artifact.kind === "delta" && !artifact.base_digest?.trim()) {
    return {
      ok: false,
      reason: "delta artifact requires base_digest",
    };
  }
  if (artifact.kind === "base" && artifact.base_digest) {
    return {
      ok: false,
      reason: "base artifact must not carry base_digest",
    };
  }
  if (
    artifact.module_id_map_digest !== undefined &&
    !artifact.module_id_map_digest.trim()
  ) {
    return {
      ok: false,
      reason: "module_id_map_digest must be non-empty when present",
    };
  }
  return { ok: true };
}
