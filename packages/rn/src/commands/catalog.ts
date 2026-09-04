/**
 * `rn module register` · `rn catalog publish|list|serve`
 *
 * productApp resolution (first hit):
 * 1. --product-app
 * 2. .rn/host-profile.jsonc `productApp`
 * 3. .rn/product-app (single-line text)
 * 4. cwd basename with trailing `-host` stripped (tiangong-host → tiangong)
 * 5. cwd basename
 *
 * Zero-arg embed: assets/catalog-embed.json if assets/ exists, else .rn/catalog-embed.json
 * when .rn/ exists. Pass --no-embed to skip; --embed-out to override.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CatalogDocument } from "@client-platform/rn-core";

import { loadDevSessionConfig } from "../dev-session-config.js";
import { writeHostMetroResolver } from "../metro-host-config.js";
import { CliError, EXIT_FAIL } from "../errors.js";
import type { CliLogger } from "../logger.js";
import { modulesFromDevSession } from "../catalog/from-dev-session.js";
import { fetchCatalogModules, startCatalogService } from "../catalog/service.js";
import { CatalogStore, defaultCatalogRoot } from "../catalog/store.js";

function stripJsoncComments(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

/** Exported for unit tests / register CLI. */
export function resolveProductApp(cwd: string, explicit?: string): string {
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }
  const root = path.resolve(cwd);
  const hostProfile = path.join(root, ".rn", "host-profile.jsonc");
  if (existsSync(hostProfile)) {
    try {
      const parsed = JSON.parse(stripJsoncComments(readFileSync(hostProfile, "utf8"))) as {
        productApp?: unknown;
      };
      if (typeof parsed.productApp === "string" && parsed.productApp.trim()) {
        return parsed.productApp.trim();
      }
    } catch {
      /* fall through */
    }
  }
  const productAppFile = path.join(root, ".rn", "product-app");
  if (existsSync(productAppFile)) {
    const line = readFileSync(productAppFile, "utf8").trim().split(/\r?\n/)[0]?.trim();
    if (line) return line;
  }
  const base = path.basename(root);
  if (base.endsWith("-host") && base.length > 5) {
    return base.slice(0, -"-host".length);
  }
  return base;
}

/** Exported for unit tests. */
export function resolveDefaultEmbedOut(
  cwd: string,
  options?: { embedOut?: string; noEmbed?: boolean },
): string | undefined {
  if (options?.noEmbed) return undefined;
  if (options?.embedOut && options.embedOut.trim()) {
    return path.resolve(cwd, options.embedOut.trim());
  }
  const root = path.resolve(cwd);
  const assetsDir = path.join(root, "assets");
  if (existsSync(assetsDir)) {
    return path.join(assetsDir, "catalog-embed.json");
  }
  if (existsSync(path.join(root, ".rn"))) {
    return path.join(root, ".rn", "catalog-embed.json");
  }
  return undefined;
}

export async function runCatalogPublish(options: {
  cwd: string;
  logger: CliLogger;
  productApp?: string;
  catalogRoot?: string;
  embedOut?: string;
  noEmbed?: boolean;
  /** Product wording for logs (register vs publish). */
  actionVerb?: "Registered" | "Published";
}): Promise<CatalogDocument> {
  const config = loadDevSessionConfig(options.cwd);
  if (!config) {
    throw new CliError(
      "no .rn/dev-session.jsonc — run: rn module register <id> [--from <repo>]",
      EXIT_FAIL,
    );
  }
  const productApp = resolveProductApp(options.cwd, options.productApp);
  const store = new CatalogStore(options.catalogRoot ?? defaultCatalogRoot());
  const before = store.read(productApp);
  const modules = modulesFromDevSession(config);
  const doc = store.publish({ productApp, modules });
  const verb = options.actionVerb ?? "Published";
  options.logger.writeHuman(
    `${verb} ${productApp} catalogRevision=${doc.catalogRevision}` +
      (before ? ` (was ${before.catalogRevision})` : " (first)"),
  );
  options.logger.writeHuman(`  modules: ${modules.map((m) => m.business_module).join(", ")}`);
  options.logger.writeHuman(`  store: ${store.currentPath(productApp)}`);

  const embedOut = resolveDefaultEmbedOut(options.cwd, {
    embedOut: options.embedOut,
    noEmbed: options.noEmbed,
  });
  if (embedOut) {
    mkdirSync(path.dirname(embedOut), { recursive: true });
    const embed = { ...doc, embeddedRevision: doc.catalogRevision };
    writeFileSync(embedOut, `${JSON.stringify(embed, null, 2)}\n`, "utf8");
    options.logger.writeHuman(`  embed snapshot: ${embedOut}`);
  }

  try {
    const resolverFile = writeHostMetroResolver(options.cwd);
    options.logger.writeHuman(`  host Metro resolver: ${resolverFile}`);
  } catch (err) {
    options.logger.warn(
      `host Metro resolver: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return doc;
}

/** Host-ops product surface — same SoT write as catalog publish. */
export async function runModuleRegister(
  options: Omit<Parameters<typeof runCatalogPublish>[0], "actionVerb"> & {
    moduleIds?: string[];
    from?: string;
    metroPort?: number;
    entry?: string;
    dryRun?: boolean;
  },
): Promise<CatalogDocument | void> {
  const { runModuleRegisterFlow } = await import("../module-catalog-register.js");
  if (options.moduleIds?.length || options.from) {
    await runModuleRegisterFlow({
      cwd: options.cwd,
      logger: options.logger,
      moduleIds: options.moduleIds,
      from: options.from,
      metroPort: options.metroPort,
      entry: options.entry,
      dryRun: options.dryRun,
      productApp: options.productApp,
      catalogRoot: options.catalogRoot,
      embedOut: options.embedOut,
      noEmbed: options.noEmbed,
    });
    return;
  }
  return runCatalogPublish({ ...options, actionVerb: "Registered" });
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
      `${productApp}: no published catalog (run rn module register to publish)`,
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
