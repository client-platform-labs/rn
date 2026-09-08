/**
 * Business module self-descriptor contract (ADR-021/D2).
 *
 * `client-platform.module.jsonc` lives in each business module repo and declares
 * its identity (business_module) + bundle entry. Consumers (rn module link,
 * ship update, host-resolver generation) read this — never a hardcoded scope or
 * sibling path. The npm package name comes from the module's package.json `name`
 * (any scope), not from this file.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";

export const MODULE_MANIFEST_FILENAME = "client-platform.module.jsonc";

export const MODULE_MANIFEST_SCHEMA_VERSION = 1;

/** Same id used in OTA sidecars / slots / dev-session. */
const BUSINESS_MODULE_RE = /^[a-z][a-z0-9_-]{0,63}$/;

export interface ModuleManifest {
  schemaVersion: number;
  /** Business module identity — the same id used in OTA sidecars / slots. */
  business_module: string;
  /** Bundle entry relative to module root, without extension (default "index"). */
  entry: string;
  /** Owning product app (informational). */
  productApp?: string;
  /** Preferred dev Metro port. */
  preferredMetroPort?: number;
}

export type ModuleManifestValidation =
  | { ok: true; manifest: ModuleManifest }
  | { ok: false; errors: string[] };

export function validateModuleManifestText(
  text: string,
): ModuleManifestValidation {
  const parseErrors: ParseError[] = [];
  const parsed: unknown = parseJsonc(text, parseErrors, {
    allowTrailingComma: true,
  });
  if (parseErrors.length > 0) {
    return {
      ok: false,
      errors: parseErrors.map(
        (err) =>
          `JSONC parse error: ${printParseErrorCode(err.error)} at offset ${err.offset}`,
      ),
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errors: [`${MODULE_MANIFEST_FILENAME} must be an object`] };
  }
  const doc = parsed as Record<string, unknown>;

  if (doc.schemaVersion !== MODULE_MANIFEST_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `schemaVersion must be ${MODULE_MANIFEST_SCHEMA_VERSION} (got ${String(doc.schemaVersion)})`,
      ],
    };
  }
  if (
    typeof doc.business_module !== "string" ||
    !BUSINESS_MODULE_RE.test(doc.business_module)
  ) {
    return {
      ok: false,
      errors: [`business_module required, must match ${BUSINESS_MODULE_RE}`],
    };
  }
  if (
    doc.entry !== undefined &&
    (typeof doc.entry !== "string" || doc.entry.trim().length === 0)
  ) {
    return { ok: false, errors: [`entry must be a non-empty string`] };
  }
  if (
    doc.preferredMetroPort !== undefined &&
    (typeof doc.preferredMetroPort !== "number" ||
      !Number.isInteger(doc.preferredMetroPort))
  ) {
    return { ok: false, errors: [`preferredMetroPort must be an integer`] };
  }

  const manifest: ModuleManifest = {
    schemaVersion: MODULE_MANIFEST_SCHEMA_VERSION,
    business_module: doc.business_module as string,
    entry:
      typeof doc.entry === "string" && doc.entry.trim()
        ? doc.entry.trim().replace(/\.(js|ts|tsx)$/, "")
        : "index",
  };
  if (typeof doc.productApp === "string") manifest.productApp = doc.productApp;
  if (typeof doc.preferredMetroPort === "number") {
    manifest.preferredMetroPort = doc.preferredMetroPort;
  }
  return { ok: true, manifest };
}

/** Load + validate a module's client-platform.module.jsonc from its repo root. */
export function loadModuleManifest(moduleRoot: string): ModuleManifestValidation {
  const file = path.join(moduleRoot, MODULE_MANIFEST_FILENAME);
  if (!existsSync(file)) {
    return {
      ok: false,
      errors: [`missing ${MODULE_MANIFEST_FILENAME} at ${moduleRoot}`],
    };
  }
  return validateModuleManifestText(readFileSync(file, "utf8"));
}
