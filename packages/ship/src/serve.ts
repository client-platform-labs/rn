import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { appendFileSync, mkdirSync, rmSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  advanceRollout,
  blockCandidateInRegistry,
  blockedUpdateIdsForRuntime,
  buildCrlDoc,
  findArtifactByDigest,
  getDeviceLane,
  isValidLane,
  killModuleUpdates,
  listDeviceLanes,
  listInstallableCandidates,
  listJsUpdateCandidates,
  loadRegistry,
  pauseModule,
  pauseRollout,
  resumeModule,
  resumeRollout,
  setDeviceLane,
  startRollout,
  tickRollout,
} from "./candidate-store.js";
import type { CandidateMetadata } from "./types.js";
import {
  checkCpBearerAuth,
  checkCpMutatingRole,
  resolveCpAuthConfig,
  resolveCpRole,
  resolveCpMinSoakMs,
} from "./cp-auth.js";
import {
  DEPENDENCY_MANIFEST_SCHEMA_VERSION,
  loadDependencyManifest,
  saveDependencyManifest,
  type DependencyManifestStore,
} from "./dependency-store.js";
import { runPromote } from "./promote.js";
import { buildDeviceJsUpdateManifest } from "./device-manifest.js";
import { pickCandidate } from "./release-shared.js";
import { resolveRegistryBackend } from "./registry-backend.js";
import { assertPortServesProject } from "./port-identity.js";
import { createLocalDirectoryArtifactStore } from "./artifact-store.js";
import { DeliveryError, EXIT_FAIL, resolveProjectRoot } from "./util.js";
import {
  KillPauseError,
  RolloutError,
  type SliSnapshot,
} from "@client-platform/core";

const STATIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../static",
);

const CP_SERVICE_NAME = "control-plane";
const CP_SERVICE_API = 1;

/** Thin in-process observability (replaceable by Prometheus / OTel later). */
type CpMetrics = {
  http_ok: number;
  http_denied: number;
  http_error: number;
  sli_posts: number;
  last_sli: Record<string, SliSnapshot>;
};

const metrics: CpMetrics = {
  http_ok: 0,
  http_denied: 0,
  http_error: 0,
  sli_posts: 0,
  last_sli: {},
};

function renderPrometheusMetrics(): string {
  const lines = [
    "# HELP cp_http_ok_total CP write routes that succeeded",
    "# TYPE cp_http_ok_total counter",
    `cp_http_ok_total ${metrics.http_ok}`,
    "# HELP cp_http_denied_total CP auth denials",
    "# TYPE cp_http_denied_total counter",
    `cp_http_denied_total ${metrics.http_denied}`,
    "# HELP cp_http_error_total CP write route errors",
    "# TYPE cp_http_error_total counter",
    `cp_http_error_total ${metrics.http_error}`,
    "# HELP cp_sli_posts_total SLI snapshots posted",
    "# TYPE cp_sli_posts_total counter",
    `cp_sli_posts_total ${metrics.sli_posts}`,
    "# HELP cp_sli_digests Number of digests with a last SLI snapshot",
    "# TYPE cp_sli_digests gauge",
    `cp_sli_digests ${Object.keys(metrics.last_sli).length}`,
  ];
  return `${lines.join("\n")}\n`;
}

/** C6.4 — structured audit log for every CP write route. One JSON line per event. */
export type CpAuditEntry = {
  ts: string;
  method: string;
  path: string;
  actor: string;
  outcome: "ok" | "denied" | "error";
  detail?: string;
  tenant?: string;
};

function auditLogDir(projectRoot: string): string {
  return path.join(projectRoot, ".rn", "distribution-lab", "logs");
}

function auditLogPath(projectRoot: string): string {
  return path.join(auditLogDir(projectRoot), "cp-audit.log");
}

/** Append a structured audit entry. Never throws (audit must not break the route). */
export function appendAudit(
  projectRoot: string,
  entry: Omit<CpAuditEntry, "ts">,
): void {
  try {
    if (entry.outcome === "ok") metrics.http_ok += 1;
    else if (entry.outcome === "denied") {
      /* counted at denial site to avoid double-count when both auth+role deny */
    } else if (entry.outcome === "error") metrics.http_error += 1;
    const dir = auditLogDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    const line: CpAuditEntry = { ...entry, ts: new Date().toISOString() };
    appendFileSync(auditLogPath(projectRoot), `${JSON.stringify(line)}\n`);
  } catch {
    // audit is best-effort; a full disk must not take the CP down.
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(`${JSON.stringify(body)}\n`);
}

function sendHtml(res: ServerResponse, status: number, html: string) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function withHostDownloadUrl(c: CandidateMetadata): CandidateMetadata & {
  download_url: string;
} {
  return withDownloadUrl(c);
}

function withDownloadUrl(c: CandidateMetadata): CandidateMetadata & {
  download_url: string;
} {
  return {
    ...c,
    download_url: `/v1/artifacts/${encodeURIComponent(c.digest)}`,
  };
}

function artifactContentInfo(meta?: {
  platform?: string;
  artifact_kind?: string;
}): { contentType: string; extension: string } {
  const kind = meta?.artifact_kind ?? "";
  const platform = meta?.platform ?? "";
  if (
    platform === "android" &&
    (kind === "app-host" || kind === "app-host-debug")
  ) {
    return {
      contentType: "application/vnd.android.package-archive",
      extension: "apk",
    };
  }
  if (platform === "android" && kind === "rn-module") {
    return { contentType: "application/octet-stream", extension: "aar" };
  }
  if (kind === "js-update") {
    return { contentType: "application/octet-stream", extension: "hbc" };
  }
  return { contentType: "application/octet-stream", extension: "bin" };
}

function streamArtifact(
  res: ServerResponse,
  filePath: string,
  digest: string,
  meta?: { platform?: string; artifact_kind?: string },
): void {
  const { contentType, extension } = artifactContentInfo(meta);
  const name = `${digest.slice(0, 12)}.${extension}`;
  const size = statSync(filePath).size;
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": size,
    "content-disposition": `attachment; filename="${name}"`,
  });
  createReadStream(filePath).pipe(res);
}

function loadConsoleHtml(): string {
  return readFileSync(path.join(STATIC_DIR, "cp-console.html"), "utf8");
}

const PORTAL_DIR = path.join(STATIC_DIR, "portal");

function loadPortalHtml(name: string): string {
  return readFileSync(path.join(PORTAL_DIR, name), "utf8");
}

function servePortalStatic(res: ServerResponse, rel: string): boolean {
  const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = path.join(PORTAL_DIR, safe);
  if (!file.startsWith(PORTAL_DIR) || !existsSync(file)) {
    return false;
  }
  const type = safe.endsWith(".js")
    ? "application/javascript; charset=utf-8"
    : "text/html; charset=utf-8";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(file));
  return true;
}

/** Map E #110 — API-only mode when Reference Console disabled. */
function cpConsoleEnabled(): boolean {
  const raw = process.env.RN_CP_DISABLE_CONSOLE?.trim().toLowerCase();
  return raw !== "1" && raw !== "true" && raw !== "yes";
}

/** Route role: public routes carry no auth; mutate routes need bearer + mutate role. */
type CpRouteRole = "public" | "mutate";

/** Decoded JSON request body — the shared shape every route handler narrows. */
type JsonObject = Record<string, unknown>;

/**
 * Parse a request body as JSON (#258). Malformed JSON is a client error, so it
 * becomes a named DeliveryError (the dispatcher maps EXIT_FAIL to 400) instead
 * of a raw SyntaxError leaking "Unexpected token" to the caller. Kept as one
 * helper so every route reports the same way — the same reason auth/role/audit
 * live in a single applyPolicy. Handlers narrow it to their own request shape.
 */
function parseJsonRequest(raw: string): JsonObject {
  try {
    return JSON.parse(raw) as JsonObject;
  } catch {
    throw new DeliveryError("invalid JSON request body", EXIT_FAIL);
  }
}

export type CpRouteMatch = { params: { id: string } };

/**
 * Everything a route handler may use — accepted, not created. Reaching for a
 * request-scoped value through here is what lets a test drive a route
 * in-process instead of spawning the CLI.
 */
type CpRouteContext = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: { id: string };
  projectRoot: string;
  /** Mutating role of the serving process (resolveCpRole()). */
  role: string;
  /** Authenticated tenant for this request; "" until applyPolicy resolves it. */
  tenant: string;
  /** Store access — one accessor, so handlers never load the registry themselves. */
  registry: () => ReturnType<typeof loadRegistry>;
  readBody: () => Promise<string>;
  audit: (entry: Omit<CpAuditEntry, "ts">) => void;
};

/** A route: transport metadata (method + path) plus its handler, as data. */
export type CpRoute = {
  method: string;
  /** Exact pathname, or a RegExp whose first group becomes ctx.params.id. */
  path: string | RegExp;
  role: CpRouteRole;
  handler: (ctx: CpRouteContext) => Promise<void>;
};

/** Match a request against one route; null when the route does not apply. */
export function matchCpRoute(
  route: CpRoute,
  method: string | undefined,
  pathname: string,
): CpRouteMatch | null {
  if (route.method !== method) return null;
  if (typeof route.path === "string") {
    return route.path === pathname ? { params: { id: "" } } : null;
  }
  const m = route.path.exec(pathname);
  if (!m) return null;
  return { params: { id: decodeURIComponent(m[1] ?? "") } };
}

export type ControlPlaneHandle = {
  projectRoot: string;
  host: string;
  port: number;
  storage: "file" | "sqlite";
  serviceMode: "cli-serve" | "cp-serve";
  /** The route table, exposed so tests can enumerate it without a process. */
  routes: readonly CpRoute[];
  listen: () => Promise<void>;
  close: () => Promise<void>;
};

/**
 * Map C C2 — closable CP HTTP server (replaceable storage: file|sqlite).
 * Not multi-tenant SaaS; Postgres remains B8.
 */
export function createControlPlane(options: {
  cwd: string;
  port?: number;
  host?: string;
  serviceMode?: "cli-serve" | "cp-serve";
}): ControlPlaneHandle {
  const projectRoot = resolveProjectRoot(options.cwd);
  const port = options.port ?? 4040;
  const host = options.host ?? "127.0.0.1";
  const serviceMode = options.serviceMode ?? "cli-serve";
  // map-j/T3: which backend is active is answered in one place.
  const storage: "file" | "sqlite" = resolveRegistryBackend(
    projectRoot,
  ).id as "file" | "sqlite";
  const artifactStore = createLocalDirectoryArtifactStore(projectRoot);
  const cpAuthConfig = resolveCpAuthConfig();
  const cpRole = resolveCpRole();

  // ── route table + policy wrapper (C3 / #258) ─────────────────────────
  // Transport only matches and dispatches. auth → role → audit live in
  // exactly one place (applyPolicy). Handlers take a context instead of
  // reaching into closure state, so a test can drive any route in process.
  const cpRoutes: CpRoute[] = [
    {
      method: "GET",
      path: /^\/(console)?$/,
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        if (!cpConsoleEnabled()) {
          sendJson(res, 404, {
            error: "console_disabled",
            hint: "RN_CP_DISABLE_CONSOLE is set; use /v1/* API only",
          });
          return;
        }
        sendHtml(res, 200, loadConsoleHtml());
        return;
      },
    },
    {
      method: "GET",
      path: /^\/portal(\/.*)?$/,
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res, url } = ctx;
        if (!cpConsoleEnabled()) {
          sendJson(res, 404, {
            error: "console_disabled",
            hint: "RN_CP_DISABLE_CONSOLE is set; portal pages unavailable",
          });
          return;
        }
        const sub =
          url.pathname === "/portal"
            ? ""
            : url.pathname.slice("/portal/".length);
        if (sub === "" || sub === "host") {
          sendHtml(res, 200, loadPortalHtml("host-distribution.html"));
          return;
        }
        if (sub === "js") {
          sendHtml(res, 200, loadPortalHtml("js-offline-publish.html"));
          return;
        }
        if (servePortalStatic(res, sub)) return;
        sendJson(res, 404, { error: "portal_not_found", path: url.pathname });
        return;
      },
    },
    {
      method: "GET",
      path: "/health",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res, projectRoot } = ctx;
        sendJson(res, 200, {
          ok: true,
          projectRoot,
          service: CP_SERVICE_NAME,
          api: CP_SERVICE_API,
        });
        return;
      },
    },
    {
      method: "GET",
      path: "/ready",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res, projectRoot } = ctx;
        const deliveryDirPath = path.join(projectRoot, ".rn/delivery");
        // map-j/T3: the backing registry file comes from the resolved backend.
        const registryFile = resolveRegistryBackend(projectRoot).registryFile();
        const artifactsPath = path.join(deliveryDirPath, "artifacts");
        const checks = {
          registry: existsSync(registryFile),
          artifacts_dir: existsSync(artifactsPath),
        };
        let writable = false;
        try {
          mkdirSync(artifactsPath, { recursive: true });
          const probe = path.join(artifactsPath, "__ready_probe__");
          appendFileSync(probe, "x");
          rmSync(probe, { force: true });
          writable = true;
        } catch {
          writable = false;
        }
        const ready = checks.registry && checks.artifacts_dir && writable;
        sendJson(res, ready ? 200 : 503, {
          ok: ready,
          service: CP_SERVICE_NAME,
          checks,
          writable,
        });
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/ota/revocations",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        // ADR-018 — K2-signed revocation list, published by the operator.
        // Format: { revoked: string[], payload: <canonical string>, seal: pem:ed25519:<b64> }
        // Device verifies seal with baked K2; a revoked key's signatures are rejected.
        const file = process.env.RN_CP_REVOCATIONS_FILE?.trim();
        let doc: {
          revoked: string[];
          payload: string;
          seal: string | null;
        } = { revoked: [], payload: "{}", seal: null };
        if (file && existsSync(file)) {
          try {
            const parsed = JSON.parse(readFileSync(file, "utf8")) as typeof doc;
            doc = {
              revoked: Array.isArray(parsed.revoked) ? parsed.revoked : [],
              payload:
                typeof parsed.payload === "string" ? parsed.payload : "{}",
              seal: typeof parsed.seal === "string" ? parsed.seal : null,
            };
          } catch {
            /* serve empty (fail-open to no revocations) */
          }
        }
        sendJson(res, 200, doc);
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/metrics",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        res.writeHead(200, {
          "content-type": "text/plain; version=0.0.4; charset=utf-8",
        });
        res.end(renderPrometheusMetrics());
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/sli",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw
          ? (parseJsonRequest(raw) as {
              digest?: string;
              sli?: SliSnapshot;
              tick?: boolean;
              human_full_approved?: boolean;
            })
          : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError("POST /v1/sli: digest required", EXIT_FAIL);
        }
        if (!body.sli || typeof body.sli !== "object") {
          throw new DeliveryError(
            "POST /v1/sli: sli object required",
            EXIT_FAIL,
          );
        }
        const digest = body.digest.trim();
        metrics.last_sli[digest] = body.sli;
        metrics.sli_posts += 1;
        ctx.audit({
          method: "POST",
          path: url.pathname,
        actor: `${ctx.role}@${ctx.tenant}`,
          outcome: "ok",
        detail: `digest=${digest} tick=${body.tick === true}`,
          tenant: ctx.tenant,
        });
        if (body.tick === true) {
          const { registry, result } = tickRollout(projectRoot, digest, {
            sli: body.sli,
            human_full_approved: body.human_full_approved === true,
          });
          sendJson(res, 200, {
            ok: true,
            action: "sli_post_tick",
            digest,
            sli: body.sli,
            tick: result.action,
            detail: result.detail,
            rollout: result.state,
            registry,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          action: "sli_post",
          digest,
          sli: body.sli,
        });
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/service",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res, projectRoot } = ctx;
        const labSoak = resolveCpMinSoakMs();
        const tenants = cpAuthConfig.tenants
          ? Object.keys(cpAuthConfig.tenants)
          : undefined;
        sendJson(res, 200, {
          name: CP_SERVICE_NAME,
          api: CP_SERVICE_API,
          mode: serviceMode,
          storage,
          projectRoot,
          replaceable_backend: true,
          default_min_soak_ms: labSoak ?? 60_000,
          auth: {
            single_token: Boolean(cpAuthConfig.token),
            tenants: tenants ?? null,
            tenant_header: "X-RN-Tenant",
          },
          metrics: "/v1/metrics",
          sli: "POST /v1/sli",
          note: "thin CP — production storage = file | sqlite; Postgres is an unwired RDS/HA seam (ADR-013 / G9)",
        });
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/candidates",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res, url } = ctx;
        const lane = url.searchParams.get("lane");
        const laneFilter = isValidLane(lane) ? lane : "all";
        const registry = ctx.registry();
        sendJson(res, 200, {
          candidates: listInstallableCandidates(registry, laneFilter).map(
            withHostDownloadUrl,
          ),
        });
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/js-updates",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res, url } = ctx;
        const lane = url.searchParams.get("lane");
        const laneFilter = isValidLane(lane) ? lane : "all";
        const moduleFilter = url.searchParams.get("module") || undefined;
        const registry = ctx.registry();
        sendJson(res, 200, {
          candidates: listJsUpdateCandidates(
            registry,
            laneFilter,
            moduleFilter || undefined,
          ).map(withDownloadUrl),
        });
        return;
      },
    },
    // ADR-024 (D3/G3): CRL — revoked signing keys (hex); devices fetch before
    // verify (F04). Signed doc: seal over canonical payload. In CERT MODE
    // (#256/P1) the seal is made with the LEAF key and the body carries the
    // cert_chain, so devices verify leaf-under-root-CA then seal-under-leaf —
    // the same trust model as releases (configure RN_DELIVERY_SIGN_KEY_* to the
    // leaf key plus RN_DELIVERY_LEAF_CERT + RN_DELIVERY_LEAF_PUBKEY_HEX). In
    // legacy mode the seal must verify against a key baked directly on the
    // device. An unsigned CRL (seal:null, no key configured) is served as-is;
    // devices fail-closed and reject it.
    {
      method: "GET",
      path: "/v1/crl",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res, projectRoot } = ctx;
        const crl = buildCrlDoc(projectRoot);
        if (crl.seal === null) {
          console.error(
            "[cp] /v1/crl served UNSIGNED (no CRL signing key) — devices will reject it (fail-closed). Configure RN_DELIVERY_SIGN_KEY_PEM/FILE or RN_DELIVERY_HSM_SIGN_CMD. ADR-024 cert mode (#256/P1): sign the CRL with the LEAF key and set RN_DELIVERY_LEAF_CERT + RN_DELIVERY_LEAF_PUBKEY_HEX so the body carries the cert_chain — devices verify leaf-under-root-CA then the seal under the leaf, the same model as releases.",
          );
        }
        sendJson(res, 200, crl);
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/js-updates/check",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { req, res, url, projectRoot } = ctx;
        const laneParam = url.searchParams.get("lane");
        const lane: "staging" | "production" =
          laneParam === "staging" ? "staging" : "production";
        const moduleId = url.searchParams.get("module")?.trim();
        if (!moduleId) {
          sendJson(res, 400, { error: "module query param required" });
          return;
        }
        const registry = ctx.registry();
        const candidates = listJsUpdateCandidates(registry, lane, moduleId);
        // Newest production candidate wins (promote appends to the production
        // window as a rollback history; the last entry is the current release).
        const meta = candidates[candidates.length - 1];
        if (!meta) {
          res.writeHead(204);
          res.end();
          return;
        }
        const proto = req.headers["x-forwarded-proto"];
        const hostHeader = req.headers.host;
        const baseUrl = hostHeader
          ? `${proto === "https" ? "https" : "http"}://${hostHeader}`
          : undefined;
        const manifest = buildDeviceJsUpdateManifest(meta, {
          baseUrl,
          projectRoot,
        });
        if (!manifest) {
          sendJson(res, 404, {
            error: "sidecar_missing",
            digest: meta.digest,
            hint: "run sign after ingest-pack to write sidecar_path",
          });
          return;
        }
        sendJson(res, 200, manifest);
        return;
      },
    },
    {
      method: "GET",
      path: /^\/v1\/artifacts\/([^/]+)$/,
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        const digest = ctx.params.id;
        const cand = findArtifactByDigest(ctx.registry(), digest);
        const filePath =
          artifactStore.get(digest) ?? cand?.path?.trim() ?? null;
        if (!filePath) {
          sendJson(res, 404, { error: "artifact_not_found", digest });
          return;
        }
        if (!existsSync(filePath)) {
          sendJson(res, 404, {
            error: "artifact_file_missing",
            digest,
            path: filePath,
          });
          return;
        }
        streamArtifact(res, filePath, digest, cand ?? undefined);
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/registry",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        sendJson(res, 200, ctx.registry());
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/registry/staging",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        sendJson(res, 200, { staging: ctx.registry().staging });
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/registry/production",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        sendJson(res, 200, {
          production: ctx.registry().production,
        });
        return;
      },
    },
    {
      method: "GET",
      path: /^\/v1\/devices\/([^/]+)\/lane$/,
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        const serial = ctx.params.id;
          const registry = ctx.registry();
          const lane = getDeviceLane(registry, serial);
          sendJson(res, 200, {
            serial,
            lane,
            devices: listDeviceLanes(registry),
          });
          return;
      },
    },
    {
      method: "PUT",
      path: /^\/v1\/devices\/([^/]+)\/lane$/,
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const serial = ctx.params.id;
          const raw = await ctx.readBody();
          const body = raw ? (parseJsonRequest(raw) as { lane?: string }) : {};
          if (!isValidLane(body.lane)) {
            ctx.audit({
              method: "PUT",
              path: url.pathname,
              actor: ctx.role,
              outcome: "error",
              detail: `invalid lane "${body.lane ?? ""}"`,
            });
            sendJson(res, 400, {
              error: "invalid lane",
              allowed: ["staging", "production", "gray"],
            });
            return;
          }
          const { registry, lane } = setDeviceLane(
            projectRoot,
            serial,
            body.lane,
          );
          ctx.audit({
            method: "PUT",
            path: url.pathname,
            actor: ctx.role,
            outcome: "ok",
            detail: `lane=${lane} serial=${serial}`,
          });
          sendJson(res, 200, {
            ok: true,
            action: "device-lane-set",
            serial,
            lane,
            registry,
          });
          return;
      },
    },
    {
      method: "GET",
      path: "/v1/devices",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        sendJson(res, 200, {
          devices: listDeviceLanes(ctx.registry()),
        });
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/dependency-manifest",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res, projectRoot } = ctx;
        sendJson(res, 200, loadDependencyManifest(projectRoot));
        return;
      },
    },
    {
      method: "PUT",
      path: "/v1/dependency-manifest",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw
          ? (parseJsonRequest(raw) as Partial<DependencyManifestStore>)
          : {};
        const saved = saveDependencyManifest(projectRoot, {
          schemaVersion: DEPENDENCY_MANIFEST_SCHEMA_VERSION,
          dependencies: Array.isArray(body.dependencies)
            ? body.dependencies
            : [],
          version_labels:
            body.version_labels && typeof body.version_labels === "object"
              ? body.version_labels
              : {},
          host_capability_set: body.host_capability_set,
          require_declared: body.require_declared === true,
        });
        ctx.audit({
          method: "PUT",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `deps=${Array.isArray(body.dependencies) ? body.dependencies.length : 0}`,
        });
        sendJson(res, 200, {
          ok: true,
          action: "dependency-manifest-put",
          path: saved,
          manifest: loadDependencyManifest(projectRoot),
        });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/promote",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw ? (parseJsonRequest(raw) as { digest?: string }) : {};
        await runPromote({
          cwd: projectRoot,
          digest: body.digest,
        });
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `digest=${body.digest ?? ""}`,
        });
        sendJson(res, 200, {
          ok: true,
          action: "promote",
          registry: ctx.registry(),
        });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/block",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw
          ? (parseJsonRequest(raw) as { digest?: string; reason?: string })
          : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError("POST /v1/block: digest required", EXIT_FAIL);
        }
        const registryBefore = ctx.registry();
        const candidate =
          registryBefore.staging.find((c) => c.digest === body.digest) ??
          registryBefore.production.find((c) => c.digest === body.digest) ??
          (() => {
            try {
              const last = pickCandidate(projectRoot);
              return last.digest === body.digest ? last : null;
            } catch {
              return null;
            }
          })();
        if (!candidate) {
          throw new DeliveryError(
            `no candidate for digest ${body.digest}`,
            EXIT_FAIL,
          );
        }
        blockCandidateInRegistry(
          projectRoot,
          candidate,
          body.reason ?? "cp-api block",
        );
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `digest=${body.digest}`,
        });
        sendJson(res, 200, {
          ok: true,
          action: "block",
          registry: ctx.registry(),
        });
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/kills",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        const registry = ctx.registry();
        sendJson(res, 200, {
          kills: registry.kills,
          pauses: registry.pauses,
          blocked_update_ids: blockedUpdateIdsForRuntime(registry),
        });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/kill",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw
          ? (parseJsonRequest(raw) as {
              business_module?: string;
              update_ids?: string[];
              reason?: string;
            })
          : {};
        const { registry, kill } = killModuleUpdates(projectRoot, {
          business_module: body.business_module ?? "",
          update_ids: body.update_ids ?? [],
          reason: body.reason,
          actor: ctx.role,
        });
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `module=${body.business_module ?? ""} updates=${(body.update_ids ?? []).join(",")}`,
        });
        sendJson(res, 200, {
          ok: true,
          action: "kill",
          kill,
          blocked_update_ids: blockedUpdateIdsForRuntime(registry),
          registry,
        });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/pause",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw
          ? (parseJsonRequest(raw) as { business_module?: string; reason?: string })
          : {};
        const { registry, pause } = pauseModule(projectRoot, {
          business_module: body.business_module ?? "",
          reason: body.reason,
          actor: ctx.role,
        });
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `module=${body.business_module ?? ""}`,
        });
        sendJson(res, 200, { ok: true, action: "pause", pause, registry });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/resume",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw
          ? (parseJsonRequest(raw) as { business_module?: string })
          : {};
        if (!body.business_module?.trim()) {
          throw new DeliveryError(
            "POST /v1/resume: business_module required",
            EXIT_FAIL,
          );
        }
        const registry = resumeModule(projectRoot, body.business_module);
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `module=${body.business_module}`,
        });
        sendJson(res, 200, { ok: true, action: "resume", registry });
        return;
      },
    },
    {
      method: "GET",
      path: "/v1/rollouts",
      role: "public",
      handler: async (ctx: CpRouteContext) => {
        const { res } = ctx;
        const registry = ctx.registry();
        sendJson(res, 200, { rollouts: registry.rollouts });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/rollout/start",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw
          ? (parseJsonRequest(raw) as {
              business_module?: string;
              digest?: string;
              update_id?: string;
              gate?: "js-standard" | "js-gated";
              min_soak_ms?: number;
              sli_thresholds?: Record<string, number>;
            })
          : {};
        const { registry, rollout } = startRollout(projectRoot, {
          business_module: body.business_module ?? "",
          digest: body.digest ?? "",
          update_id: body.update_id,
          gate: body.gate,
          actor: ctx.role,
          min_soak_ms: body.min_soak_ms ?? resolveCpMinSoakMs(),
          sli_thresholds: body.sli_thresholds,
        });
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `module=${body.business_module ?? ""} digest=${body.digest ?? ""}`,
        });
        sendJson(res, 200, {
          ok: true,
          action: "rollout_start",
          rollout,
          registry,
        });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/rollout/advance",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw
          ? (parseJsonRequest(raw) as {
              digest?: string;
              human_full_approved?: boolean;
              force_soak?: boolean;
            })
          : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError(
            "POST /v1/rollout/advance: digest required",
            EXIT_FAIL,
          );
        }
        const { registry, rollout } = advanceRollout(projectRoot, body.digest, {
          human_full_approved: body.human_full_approved,
          forceSoak: body.force_soak === true,
        });
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `digest=${body.digest}`,
        });
        sendJson(res, 200, {
          ok: true,
          action: "rollout_advance",
          rollout,
          registry,
        });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/rollout/pause",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw ? (parseJsonRequest(raw) as { digest?: string }) : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError(
            "POST /v1/rollout/pause: digest required",
            EXIT_FAIL,
          );
        }
        const { registry, rollout } = pauseRollout(projectRoot, body.digest);
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `digest=${body.digest}`,
        });
        sendJson(res, 200, {
          ok: true,
          action: "rollout_pause",
          rollout,
          registry,
        });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/rollout/resume",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw ? (parseJsonRequest(raw) as { digest?: string }) : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError(
            "POST /v1/rollout/resume: digest required",
            EXIT_FAIL,
          );
        }
        const { registry, rollout } = resumeRollout(projectRoot, body.digest);
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `digest=${body.digest}`,
        });
        sendJson(res, 200, {
          ok: true,
          action: "rollout_resume",
          rollout,
          registry,
        });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/rollout/slo-breach",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw
          ? (parseJsonRequest(raw) as { digest?: string; reason?: string })
          : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError(
            "POST /v1/rollout/slo-breach: digest required",
            EXIT_FAIL,
          );
        }
        const { registry, rollout } = pauseRollout(projectRoot, body.digest);
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `digest=${body.digest} reason=${body.reason?.trim() || "slo_breach"}`,
        });
        sendJson(res, 200, {
          ok: true,
          action: "rollout_slo_breach_pause",
          reason: body.reason?.trim() || "slo_breach",
          rollout,
          registry,
        });
        return;
      },
    },
    {
      method: "POST",
      path: "/v1/rollout/tick",
      role: "mutate",
      handler: async (ctx: CpRouteContext) => {
        const { res, url, projectRoot } = ctx;
        const raw = await ctx.readBody();
        const body = raw
          ? (parseJsonRequest(raw) as {
              digest?: string;
              sli?: Record<string, number>;
              human_full_approved?: boolean;
              now?: string;
            })
          : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError(
            "POST /v1/rollout/tick: digest required",
            EXIT_FAIL,
          );
        }
        const { registry, result } = tickRollout(projectRoot, body.digest, {
          sli: body.sli,
          human_full_approved: body.human_full_approved === true,
          now: body.now ? new Date(body.now) : undefined,
        });
        ctx.audit({
          method: "POST",
          path: url.pathname,
          actor: ctx.role,
          outcome: "ok",
        detail: `digest=${body.digest} tick=${result.action}`,
        });
        sendJson(res, 200, {
          ok: true,
          action: "rollout_tick",
          tick: result.action,
          detail: result.detail,
          rollout: result.state,
          registry,
        });
        return;
      },
    },
  ];

  /** Per-request context handed to a route handler. */
  const makeRouteContext = (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    params: { id: string },
  ): CpRouteContext => ({
    req,
    res,
    url,
    params,
    projectRoot,
    role: cpRole,
    // Filled in by applyPolicy once the bearer token resolves a tenant.
    tenant: "",
    registry: () => loadRegistry(projectRoot),
    readBody: () => readBody(req),
    audit: (entry) => appendAudit(projectRoot, entry),
  });

  /**
   * The one place a CP request is authenticated, authorised and audited.
   * Public routes short-circuit; mutating routes need a bearer token and a
   * mutating role, and every denial is audited before the response is sent.
   */
  const applyPolicy = (route: CpRoute, ctx: CpRouteContext): boolean => {
    if (route.role === "public") return true;
    const tenantHeader = ctx.req.headers["x-rn-tenant"];
    const tenant =
      typeof tenantHeader === "string" ? tenantHeader : undefined;
    const auth = checkCpBearerAuth(
      ctx.req.headers.authorization,
      cpAuthConfig,
      tenant,
    );
    if (!auth.ok) {
      metrics.http_denied += 1;
      ctx.audit({
        method: ctx.req.method ?? "UNKNOWN",
        path: ctx.url.pathname,
        actor: "anonymous",
        outcome: "denied",
        detail: auth.error,
        tenant,
      });
      sendJson(ctx.res, auth.status, { error: auth.error });
      return false;
    }
    ctx.tenant = auth.tenant;
    const role = checkCpMutatingRole(cpRole);
    if (!role.ok) {
      metrics.http_denied += 1;
      ctx.audit({
        method: ctx.req.method ?? "UNKNOWN",
        path: ctx.url.pathname,
        actor: `${cpRole}@${auth.tenant}`,
        outcome: "denied",
        detail: role.error,
        tenant: auth.tenant,
      });
      sendJson(ctx.res, role.status, { error: role.error });
      return false;
    }
    return true;
  };

  const server: Server = createServer((req, res) => {
    void dispatch(req, res);
  });

  async function dispatch(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${host}`);
    console.error(`[cp-access] ${req.method} ${url.pathname}${url.search}`);
    try {
      for (const route of cpRoutes) {
        const match = matchCpRoute(route, req.method, url.pathname);
        if (!match) continue;
        const ctx = makeRouteContext(req, res, url, match.params);
        if (!applyPolicy(route, ctx)) return;
        await route.handler(ctx);
        return;
      }
      sendJson(res, 404, { error: "not_found", path: url.pathname });
    } catch (err) {
      if (err instanceof KillPauseError || err instanceof RolloutError) {
        sendJson(res, 400, { error: err.message, code: err.code });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof DeliveryError ? err.exitCode : EXIT_FAIL;
      sendJson(res, code === EXIT_FAIL ? 400 : 500, { error: message });
    }
  }

  return {
    projectRoot,
    host,
    port,
    storage,
    serviceMode,
    routes: cpRoutes,
    listen: () =>
      new Promise((resolve, reject) => {
        // SEAM-5/F16: refuse to bind when the port already serves ANOTHER
        // project's CP (identify via the listener's working directory).
        try {
          assertPortServesProject("control-plane", port, projectRoot);
        } catch (err) {
          reject(err);
          return;
        }
        server.once("error", reject);
        server.listen(port, host, () => resolve());
      }),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function printBanner(handle: ControlPlaneHandle, label: string): void {
  const { host, port, projectRoot, storage, serviceMode } = handle;
  console.error(`${label}: http://${host}:${port} (project ${projectRoot})`);
  console.error(
    `  service: ${CP_SERVICE_NAME} mode=${serviceMode} storage=${storage}`,
  );
  console.error("  GET  /v1/service | /health");
  console.error("  GET  /  (thin CP Web console)");
  console.error("  GET  /v1/candidates?lane=  (host APK + download_url)");
  console.error("  GET  /v1/artifacts/:digest  (Map E host download)");
  console.error("  GET  /v1/js-updates?lane=&module=  (Map E JS train)");
  console.error("  GET|PUT /v1/dependency-manifest (Map E deps)");
  console.error(
    "  GET  /v1/devices | GET|PUT /v1/devices/:serial/lane (C6.3 grey slice)",
  );
  console.error(
    "  POST /v1/rollout/slo-breach { digest, reason } (C2 thin P10)",
  );
  console.error("  POST /v1/rollout/tick { digest, sli?, now? } (C5 P10 auto)");
  console.error("  GET  /v1/metrics  (Prometheus text — thin observability)");
  console.error(
    "  POST /v1/sli { digest, sli, tick? }  (SLI ingest → optional tick)",
  );
  console.error("  auth: RN_CP_TOKEN | RN_CP_TENANTS + X-RN-Tenant");
  console.error("  audit -> .rn/distribution-lab/logs/cp-audit.log (C6.4)");
}

/** Map B thin CP — CLI-embedded serve (compat). */
export async function runServe(options: {
  cwd: string;
  port?: number;
  host?: string;
}): Promise<void> {
  const handle = createControlPlane({ ...options, serviceMode: "cli-serve" });
  await handle.listen();
  printBanner(handle, "ship serve");
  await new Promise(() => {
    /* keep alive until SIGINT */
  });
}

/**
 * Map C C2 — dedicated CP service entry.
 * Project root: options.cwd or RN_CP_PROJECT.
 */
export async function runCpServe(options: {
  cwd: string;
  port?: number;
  host?: string;
}): Promise<void> {
  const cwd = process.env.RN_CP_PROJECT?.trim() || options.cwd;
  const handle = createControlPlane({
    cwd,
    port: options.port,
    host: options.host,
    serviceMode: "cp-serve",
  });
  await handle.listen();
  printBanner(handle, "ship cp-serve");
  const shutdown = async () => {
    try {
      await handle.close();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await new Promise(() => {
    /* keep alive until signal */
  });
}
