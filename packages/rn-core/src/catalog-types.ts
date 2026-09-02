/**
 * Product Module Catalog document (module-first Dev DX).
 * SoT = Catalog Service after `rn catalog publish`; shell `.rn/dev-session.jsonc` is draft only.
 * Aligns with closed-loop §1.4 and runtime YES/PARTIAL pathRouting.
 */

export const CATALOG_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type CatalogPathRoutingModule = {
  business_module: string;
  pathRouting: true;
  routePrefix: string;
  preferredMetroPort?: number;
  entry?: string;
};

export type CatalogModuleIdOnlyModule = {
  business_module: string;
  pathRouting: false;
  preferredMetroPort?: number;
  entry?: string;
  /** Must not be set when pathRouting is false. */
  routePrefix?: undefined;
};

export type CatalogModuleEntry =
  | CatalogPathRoutingModule
  | CatalogModuleIdOnlyModule
  | {
      /** Legacy / draft rows: pathRouting omitted → treated as path-eligible only if routePrefix set at publish. */
      business_module: string;
      preferredMetroPort?: number;
      entry?: string;
      routePrefix?: string;
      pathRouting?: undefined;
    };

export type CatalogDocument = {
  schemaVersion: typeof CATALOG_DOCUMENT_SCHEMA_VERSION;
  catalogRevision: number;
  productApp: string;
  publishedAt: string;
  modules: CatalogModuleEntry[];
  /** Revision baked into current Debug Host APK when known. */
  embeddedRevision?: number;
};

export type CatalogIssueCode =
  | "MISSING_FIELD"
  | "INVALID_TYPE"
  | "INVALID_REVISION"
  | "DUPLICATE_MODULE"
  | "DUPLICATE_ROUTE_PREFIX"
  | "ROUTE_PREFIX_REQUIRED"
  | "ROUTE_PREFIX_FORBIDDEN"
  | "INVALID_ROUTE_PREFIX";

export type CatalogIssue = {
  path: string;
  code: CatalogIssueCode;
  reason: string;
};

export type CatalogValidation = {
  ok: boolean;
  issues: CatalogIssue[];
  document?: CatalogDocument;
};

const MODULE_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const ROUTE_PREFIX_RE = /^\/[A-Za-z0-9._~/-]*$/;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Fail-closed validation for Catalog Service documents.
 * Path-routing modules (pathRouting===true or routePrefix present without pathRouting:false)
 * require unique routePrefix; moduleId-only (pathRouting:false) forbid routePrefix.
 */
export function validateCatalogDocument(input: unknown): CatalogValidation {
  const issues: CatalogIssue[] = [];

  if (!isPlainObject(input)) {
    return {
      ok: false,
      issues: [
        {
          path: "",
          code: "INVALID_TYPE",
          reason: "catalog document must be an object",
        },
      ],
    };
  }

  if (input.schemaVersion !== CATALOG_DOCUMENT_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      code: "INVALID_TYPE",
      reason: `schemaVersion must be ${CATALOG_DOCUMENT_SCHEMA_VERSION}`,
    });
  }

  if (
    typeof input.catalogRevision !== "number" ||
    !Number.isInteger(input.catalogRevision) ||
    input.catalogRevision < 1
  ) {
    issues.push({
      path: "catalogRevision",
      code: "INVALID_REVISION",
      reason: "catalogRevision must be an integer >= 1",
    });
  }

  if (!nonEmptyString(input.productApp)) {
    issues.push({
      path: "productApp",
      code: "MISSING_FIELD",
      reason: "productApp is required",
    });
  }

  if (!nonEmptyString(input.publishedAt)) {
    issues.push({
      path: "publishedAt",
      code: "MISSING_FIELD",
      reason: "publishedAt is required (ISO-8601)",
    });
  }

  if (input.embeddedRevision !== undefined) {
    if (
      typeof input.embeddedRevision !== "number" ||
      !Number.isInteger(input.embeddedRevision) ||
      input.embeddedRevision < 1
    ) {
      issues.push({
        path: "embeddedRevision",
        code: "INVALID_REVISION",
        reason: "embeddedRevision must be an integer >= 1 when set",
      });
    }
  }

  if (!Array.isArray(input.modules)) {
    issues.push({
      path: "modules",
      code: "INVALID_TYPE",
      reason: "modules must be an array",
    });
    return { ok: false, issues };
  }

  const seenModules = new Set<string>();
  const seenPrefixes = new Map<string, string>();

  input.modules.forEach((raw, index) => {
    const base = `modules[${index}]`;
    if (!isPlainObject(raw)) {
      issues.push({
        path: base,
        code: "INVALID_TYPE",
        reason: "module entry must be an object",
      });
      return;
    }

    if (!nonEmptyString(raw.business_module)) {
      issues.push({
        path: `${base}.business_module`,
        code: "MISSING_FIELD",
        reason: "business_module is required",
      });
      return;
    }

    if (!MODULE_ID_RE.test(raw.business_module)) {
      issues.push({
        path: `${base}.business_module`,
        code: "INVALID_TYPE",
        reason: `business_module must match ${MODULE_ID_RE}`,
      });
    }

    if (seenModules.has(raw.business_module)) {
      issues.push({
        path: `${base}.business_module`,
        code: "DUPLICATE_MODULE",
        reason: `duplicate business_module ${raw.business_module}`,
      });
    }
    seenModules.add(raw.business_module);

    if (
      raw.preferredMetroPort !== undefined &&
      (typeof raw.preferredMetroPort !== "number" ||
        !Number.isInteger(raw.preferredMetroPort) ||
        raw.preferredMetroPort < 1 ||
        raw.preferredMetroPort > 65535)
    ) {
      issues.push({
        path: `${base}.preferredMetroPort`,
        code: "INVALID_TYPE",
        reason: "preferredMetroPort must be an integer 1–65535",
      });
    }

    if (raw.entry !== undefined && !nonEmptyString(raw.entry)) {
      issues.push({
        path: `${base}.entry`,
        code: "INVALID_TYPE",
        reason: "entry must be a non-empty string when set",
      });
    }

    const pathRouting = raw.pathRouting;
    const routePrefix = raw.routePrefix;

    if (pathRouting === false) {
      if (routePrefix !== undefined) {
        issues.push({
          path: `${base}.routePrefix`,
          code: "ROUTE_PREFIX_FORBIDDEN",
          reason: "moduleId-only modules must not set routePrefix",
        });
      }
      return;
    }

    if (pathRouting === true) {
      if (!nonEmptyString(routePrefix)) {
        issues.push({
          path: `${base}.routePrefix`,
          code: "ROUTE_PREFIX_REQUIRED",
          reason: "pathRouting:true requires routePrefix",
        });
        return;
      }
    }

    if (routePrefix !== undefined) {
      if (!nonEmptyString(routePrefix) || !ROUTE_PREFIX_RE.test(routePrefix)) {
        issues.push({
          path: `${base}.routePrefix`,
          code: "INVALID_ROUTE_PREFIX",
          reason: "routePrefix must be a path starting with /",
        });
        return;
      }
      const normalized = routePrefix.replace(/\/+$/, "") || "/";
      const owner = seenPrefixes.get(normalized);
      if (owner) {
        issues.push({
          path: `${base}.routePrefix`,
          code: "DUPLICATE_ROUTE_PREFIX",
          reason: `routePrefix ${normalized} already used by ${owner}`,
        });
      } else {
        seenPrefixes.set(normalized, raw.business_module);
      }
    }
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    issues: [],
    document: input as CatalogDocument,
  };
}

/** True when module participates in ShellRouter path table. */
export function catalogModuleInPathTable(entry: CatalogModuleEntry): boolean {
  if (entry.pathRouting === false) {
    return false;
  }
  if (entry.pathRouting === true) {
    return true;
  }
  return typeof entry.routePrefix === "string" && entry.routePrefix.length > 0;
}
