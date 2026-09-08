/**
 * Map D D2 / P12 — multi-business-line release_unit identity (contract).
 * Isolation key: product_app + business_module + train + channel.
 */

export type ReleaseUnit = {
  product_app: string;
  business_module: string;
  train: string;
  channel: string;
};

export type ReleaseUnitValidation =
  | { ok: true; unit: ReleaseUnit }
  | { ok: false; reason: string };

const KEY_SEP = "/";

export function formatReleaseUnitKey(unit: ReleaseUnit): string {
  return [unit.product_app, unit.business_module, unit.train, unit.channel].join(
    KEY_SEP,
  );
}

export function parseReleaseUnitKey(key: string): ReleaseUnit | null {
  const parts = key.split(KEY_SEP);
  if (parts.length !== 4) return null;
  const [product_app, business_module, train, channel] = parts;
  if (!product_app || !business_module || !train || !channel) return null;
  return { product_app, business_module, train, channel };
}

export function validateReleaseUnit(
  input: Partial<ReleaseUnit>,
): ReleaseUnitValidation {
  const product_app = input.product_app?.trim() ?? "";
  const business_module = input.business_module?.trim() ?? "";
  const train = input.train?.trim() ?? "";
  const channel = input.channel?.trim() ?? "";
  if (!product_app) return { ok: false, reason: "release_unit: product_app required" };
  if (!business_module) {
    return { ok: false, reason: "release_unit: business_module required" };
  }
  if (!train) return { ok: false, reason: "release_unit: train required" };
  if (!channel) return { ok: false, reason: "release_unit: channel required" };
  return {
    ok: true,
    unit: { product_app, business_module, train, channel },
  };
}

export function releaseUnitFromCandidate(input: {
  product_app?: string;
  business_module?: string;
  release_id?: string;
  channel?: string;
  train?: string;
}): ReleaseUnitValidation {
  return validateReleaseUnit({
    product_app: input.product_app ?? "_default_app",
    business_module: input.business_module,
    train: input.train ?? input.release_id ?? "production",
    channel: input.channel ?? "default",
  });
}

/**
 * P12: same business_module must not appear under two product_app keys.
 */
export function validateModuleProductIsolation(
  bindings: readonly { product_app: string; business_module: string }[],
): { ok: true } | { ok: false; reason: string } {
  const owner = new Map<string, string>();
  for (const b of bindings) {
    const mod = b.business_module?.trim();
    const app = b.product_app?.trim();
    if (!mod || !app) {
      return { ok: false, reason: "module isolation: empty product_app or business_module" };
    }
    const prev = owner.get(mod);
    if (prev && prev !== app) {
      return {
        ok: false,
        reason: `module isolation: business_module=${mod} bound to ${prev} and ${app}`,
      };
    }
    owner.set(mod, app);
  }
  return { ok: true };
}
