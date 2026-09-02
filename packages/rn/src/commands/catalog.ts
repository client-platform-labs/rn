/**
 * `rn catalog publish|list|serve`
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CatalogDocument } from "@client-platform/rn-core";

import { loadDevSessionConfig } from "../dev-session-config.js";
import { CliError, EXIT_FAIL } from "../errors.js";
import type { CliLogger } from "../logger.js";
import { modulesFromDevSession } from "../catalog/from-dev-session.js";
import { fetchCatalogModules, startCatalogService } from "../catalog/service.js";
import { CatalogStore, defaultCatalogRoot } from "../catalog/store.js";

function resolveProductApp(cwd: string, explicit?: string): string {
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }
  // Prefer directory name of host project as productApp (tiangong-host → tiangong-host)
  return path.basename(path.resolve(cwd));
}

export async function runCatalogPublish(options: {
  cwd: string;
  logger: CliLogger;
  productApp?: string;
  catalogRoot?: string;
  embedOut?: string;
}): Promise<CatalogDocument> {
  const config = loadDevSessionConfig(options.cwd);
  if (!config) {
    throw new CliError(
      "no .rn/dev-session.jsonc — run rn module link first (draft only until publish)",
      EXIT_FAIL,
    );
  }
  const productApp = resolveProductApp(options.cwd, options.productApp);
  const store = new CatalogStore(options.catalogRoot ?? defaultCatalogRoot());
  const before = store.read(productApp);
  const modules = modulesFromDevSession(config);
  const doc = store.publish({ productApp, modules });
  options.logger.writeHuman(
    `Published ${productApp} catalogRevision=${doc.catalogRevision}` +
      (before ? ` (was ${before.catalogRevision})` : " (first)"),
  );
  options.logger.writeHuman(`  modules: ${modules.map((m) => m.business_module).join(", ")}`);
  options.logger.writeHuman(`  store: ${store.currentPath(productApp)}`);

  if (options.embedOut) {
    mkdirSync(path.dirname(path.resolve(options.embedOut)), { recursive: true });
    const embed = { ...doc, embeddedRevision: doc.catalogRevision };
    writeFileSync(options.embedOut, `${JSON.stringify(embed, null, 2)}\n`, "utf8");
    options.logger.writeHuman(`  embed snapshot: ${options.embedOut}`);
  }
  return doc;
}

export async function runCatalogList(options: {
  cwd: string;
  logger: CliLogger;
  productApp?: string;
  catalogRoot?: string;
  baseUrl?: string;
}): Promise<void> {
  const productApp = resolveProductApp(options.cwd, options.productApp);
  if (options.baseUrl) {
    const res = await fetchCatalogModules({
      baseUrl: options.baseUrl,
      productApp,
    });
    if (!res.ok) {
      throw new CliError(
        `catalog P2 GET failed: HTTP ${res.status}`,
        EXIT_FAIL,
      );
    }
    const doc = (await res.json()) as CatalogDocument;
    options.logger.writeHuman(
      `${productApp} rev=${doc.catalogRevision} (via ${options.baseUrl})`,
    );
    for (const m of doc.modules) {
      options.logger.writeHuman(`  - ${m.business_module}`);
    }
    return;
  }
  const store = new CatalogStore(options.catalogRoot ?? defaultCatalogRoot());
  const doc = store.read(productApp);
  if (!doc) {
    options.logger.writeHuman(
      `${productApp}: no published catalog (link-only draft is not visible here)`,
    );
    return;
  }
  options.logger.writeHuman(`${productApp} rev=${doc.catalogRevision}`);
  for (const m of doc.modules) {
    options.logger.writeHuman(`  - ${m.business_module}`);
  }
}

export async function runCatalogServe(options: {
  logger: CliLogger;
  catalogRoot?: string;
  host?: string;
  port?: number;
}): Promise<void> {
  const handle = await startCatalogService({
    store: new CatalogStore(options.catalogRoot ?? defaultCatalogRoot()),
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 7410,
  });
  options.logger.writeHuman(
    `Catalog Service listening ${handle.baseUrl} (GET /v1/products/:app/modules)`,
  );
  await new Promise<void>(() => {
    /* run until process signal */
  });
}
