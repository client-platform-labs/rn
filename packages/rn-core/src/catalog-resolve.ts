/**
 * P2-prefer catalog resolve for Debug Host panel.
 * Prefer live Catalog Service document; fall back to embedded snapshot.
 */
import type { CatalogDocument } from "./catalog-types.js";
import { validateCatalogDocument } from "./catalog-types.js";

export type CatalogResolveResult = {
  document: CatalogDocument;
  source: "p2" | "embedded";
  catalogRevision: number;
  embeddedRevision?: number;
  staleHint: boolean;
};

export async function resolveCatalogForHost(options: {
  productApp: string;
  /** Embedded bake from APK / assets */
  embedded?: CatalogDocument | null;
  /** Catalog Service base URL; omit or fail → embedded */
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<CatalogResolveResult | { ok: false; reason: string }> {
  const fetchFn = options.fetchImpl ?? fetch;
  let p2: CatalogDocument | null = null;
  if (options.baseUrl) {
    try {
      const url = `${options.baseUrl.replace(/\/$/, "")}/v1/products/${encodeURIComponent(options.productApp)}/modules`;
      const res = await fetchFn(url);
      if (res.ok) {
        const raw = (await res.json()) as unknown;
        const v = validateCatalogDocument(raw);
        if (v.ok && v.document) {
          p2 = v.document;
        }
      }
    } catch {
      // fall through to embedded
    }
  }

  if (p2) {
    const embeddedRevision = options.embedded?.embeddedRevision ?? options.embedded?.catalogRevision;
    return {
      document: p2,
      source: "p2",
      catalogRevision: p2.catalogRevision,
      embeddedRevision,
      staleHint: Boolean(
        embeddedRevision !== undefined && p2.catalogRevision > embeddedRevision,
      ),
    };
  }

  if (options.embedded) {
    const v = validateCatalogDocument(options.embedded);
    if (!v.ok || !v.document) {
      return { ok: false, reason: "embedded_catalog_invalid" };
    }
    return {
      document: v.document,
      source: "embedded",
      catalogRevision: v.document.catalogRevision,
      embeddedRevision: v.document.embeddedRevision ?? v.document.catalogRevision,
      staleHint: true,
    };
  }

  return { ok: false, reason: "catalog_unavailable" };
}
