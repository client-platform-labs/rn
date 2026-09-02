/**
 * Local filesystem Catalog Service store.
 * SoT after publish; shell .rn/dev-session.jsonc remains draft only.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  type CatalogDocument,
  type CatalogModuleEntry,
  validateCatalogDocument,
} from "@client-platform/rn-core";

export function defaultCatalogRoot(): string {
  return path.join(os.homedir(), ".client-platform", "catalog");
}

export type CatalogPublishInput = {
  productApp: string;
  modules: CatalogModuleEntry[];
  publishedAt?: string;
};

export class CatalogStore {
  readonly root: string;

  constructor(root: string = defaultCatalogRoot()) {
    this.root = root;
  }

  productDir(productApp: string): string {
    return path.join(this.root, productApp);
  }

  currentPath(productApp: string): string {
    return path.join(this.productDir(productApp), "current.json");
  }

  read(productApp: string): CatalogDocument | null {
    const file = this.currentPath(productApp);
    if (!existsSync(file)) {
      return null;
    }
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const result = validateCatalogDocument(raw);
    if (!result.ok || !result.document) {
      throw new Error(
        `corrupt catalog for ${productApp}: ${result.issues.map((i) => i.reason).join("; ")}`,
      );
    }
    return result.document;
  }

  /**
   * Publish a new revision. Monotonic catalogRevision.
   * Does not read shell draft — caller maps draft → modules.
   */
  publish(input: CatalogPublishInput): CatalogDocument {
    const prev = this.read(input.productApp);
    const catalogRevision = (prev?.catalogRevision ?? 0) + 1;
    const publishedAt = input.publishedAt ?? new Date().toISOString();
    const document: CatalogDocument = {
      schemaVersion: 1,
      catalogRevision,
      productApp: input.productApp,
      publishedAt,
      modules: input.modules,
      embeddedRevision: prev?.embeddedRevision,
    };
    const validated = validateCatalogDocument(document);
    if (!validated.ok || !validated.document) {
      throw new Error(
        `catalog publish rejected: ${validated.issues.map((i) => `${i.path}: ${i.reason}`).join("; ")}`,
      );
    }
    const dir = this.productDir(input.productApp);
    mkdirSync(dir, { recursive: true });
    const revPath = path.join(dir, `rev-${catalogRevision}.json`);
    const tmp = `${revPath}.tmp`;
    const body = `${JSON.stringify(validated.document, null, 2)}\n`;
    writeFileSync(tmp, body, "utf8");
    renameSync(tmp, revPath);
    writeFileSync(this.currentPath(input.productApp), body, "utf8");
    return validated.document;
  }
}
