import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
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
  findInstallableByDigest,
  findArtifactByDigest,
  killModuleUpdates,
  listInstallableCandidates,
  listJsUpdateCandidates,
  loadRegistry,
  pauseModule,
  pauseRollout,
  resumeModule,
  resumeRollout,
  startRollout,
  tickRollout,
} from "./candidate-store.js";
import type { CandidateMetadata } from "./types.js";
import {
  checkCpBearerAuth,
  checkCpMutatingRole,
  resolveCpAuthToken,
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
import { useSqliteRegistry } from "./registry-sqlite.js";
import { usePostgresRegistry } from "./registry-postgres.js";
import { DeliveryError, EXIT_FAIL, resolveProjectRoot } from "./util.js";
import { KillPauseError, RolloutError } from "@client-platform/rn-core";

const STATIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../static",
);

const CP_SERVICE_NAME = "control-plane";
const CP_SERVICE_API = 1;

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

function streamArtifact(
  res: ServerResponse,
  filePath: string,
  digest: string,
): void {
  const name = path.basename(filePath) || `${digest.slice(0, 12)}.apk`;
  const size = statSync(filePath).size;
  res.writeHead(200, {
    "content-type": "application/vnd.android.package-archive",
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

function servePortalStatic(
  res: ServerResponse,
  rel: string,
): boolean {
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

export type ControlPlaneHandle = {
  projectRoot: string;
  host: string;
  port: number;
  storage: "file" | "sqlite";
  serviceMode: "cli-serve" | "cp-serve";
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
  const storage: "file" | "sqlite" = useSqliteRegistry() ? "sqlite" : "file";
  const cpAuthToken = resolveCpAuthToken();
  const cpRole = resolveCpRole();

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    try {
      const requireCpAuth = () => {
        const auth = checkCpBearerAuth(req.headers.authorization, cpAuthToken);
        if (!auth.ok) {
          sendJson(res, auth.status, { error: auth.error });
          return false;
        }
        const role = checkCpMutatingRole(cpRole);
        if (!role.ok) {
          sendJson(res, role.status, { error: role.error });
          return false;
        }
        return true;
      };

      if (
        req.method === "GET" &&
        (url.pathname === "/" || url.pathname === "/console")
      ) {
        if (!cpConsoleEnabled()) {
          sendJson(res, 404, {
            error: "console_disabled",
            hint: "RN_CP_DISABLE_CONSOLE is set; use /v1/* API only",
          });
          return;
        }
        sendHtml(res, 200, loadConsoleHtml());
        return;
      }

      if (
        req.method === "GET" &&
        (url.pathname === "/portal" || url.pathname.startsWith("/portal/"))
      ) {
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
      }

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
          projectRoot,
          service: CP_SERVICE_NAME,
          api: CP_SERVICE_API,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/service") {
        const labSoak = resolveCpMinSoakMs();
        sendJson(res, 200, {
          name: CP_SERVICE_NAME,
          api: CP_SERVICE_API,
          mode: serviceMode,
          storage,
          projectRoot,
          replaceable_backend: true,
          default_min_soak_ms: labSoak ?? 60_000,
          postgres: usePostgresRegistry(),
          postgres_env: "RN_CP_DATABASE_URL",
          note: usePostgresRegistry()
            ? "thin CP — Postgres adapter contract (B8); default storage remains file/sqlite"
            : "thin CP — Postgres adapter contract = Map B B8 (opt-in via RN_CP_DATABASE_URL)",
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/candidates") {
        const lane = url.searchParams.get("lane");
        const laneFilter =
          lane === "staging" || lane === "production" ? lane : "all";
        const registry = loadRegistry(projectRoot);
        sendJson(res, 200, {
          candidates: listInstallableCandidates(registry, laneFilter).map(
            withHostDownloadUrl,
          ),
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/js-updates") {
        const lane = url.searchParams.get("lane");
        const laneFilter =
          lane === "staging" || lane === "production" ? lane : "all";
        const moduleFilter = url.searchParams.get("module") || undefined;
        const registry = loadRegistry(projectRoot);
        sendJson(res, 200, {
          candidates: listJsUpdateCandidates(
            registry,
            laneFilter,
            moduleFilter || undefined,
          ).map(withDownloadUrl),
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/js-updates/check") {
        const laneParam = url.searchParams.get("lane");
        const lane: "staging" | "production" =
          laneParam === "staging" ? "staging" : "production";
        const moduleId = url.searchParams.get("module")?.trim();
        if (!moduleId) {
          sendJson(res, 400, { error: "module query param required" });
          return;
        }
        const registry = loadRegistry(projectRoot);
        const candidates = listJsUpdateCandidates(
          registry,
          lane,
          moduleId,
        );
        const meta = candidates[0];
        if (!meta) {
          res.writeHead(204);
          res.end();
          return;
        }
        const proto = req.headers["x-forwarded-proto"];
        const hostHeader = req.headers.host;
        const baseUrl =
          hostHeader ?
            `${proto === "https" ? "https" : "http"}://${hostHeader}`
          : undefined;
        const manifest = buildDeviceJsUpdateManifest(meta, { baseUrl });
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
      }

      {
        const artMatch = url.pathname.match(/^\/v1\/artifacts\/([^/]+)$/);
        if (req.method === "GET" && artMatch) {
          const digest = decodeURIComponent(artMatch[1] ?? "");
          const registry = loadRegistry(projectRoot);
          const cand = findArtifactByDigest(registry, digest);
          if (!cand?.path?.trim()) {
            sendJson(res, 404, { error: "artifact_not_found", digest });
            return;
          }
          if (!existsSync(cand.path)) {
            sendJson(res, 404, {
              error: "artifact_file_missing",
              digest,
              path: cand.path,
            });
            return;
          }
          streamArtifact(res, cand.path, cand.digest);
          return;
        }
      }

      if (req.method === "GET" && url.pathname === "/v1/registry") {
        sendJson(res, 200, loadRegistry(projectRoot));
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/registry/staging") {
        sendJson(res, 200, { staging: loadRegistry(projectRoot).staging });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/registry/production") {
        sendJson(res, 200, {
          production: loadRegistry(projectRoot).production,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/dependency-manifest") {
        sendJson(res, 200, loadDependencyManifest(projectRoot));
        return;
      }

      if (req.method === "PUT" && url.pathname === "/v1/dependency-manifest") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw
          ? (JSON.parse(raw) as Partial<DependencyManifestStore>)
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
        sendJson(res, 200, {
          ok: true,
          action: "dependency-manifest-put",
          path: saved,
          manifest: loadDependencyManifest(projectRoot),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/promote") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw ? (JSON.parse(raw) as { digest?: string }) : {};
        await runPromote({
          cwd: projectRoot,
          digest: body.digest,
        });
        sendJson(res, 200, {
          ok: true,
          action: "promote",
          registry: loadRegistry(projectRoot),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/block") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw
          ? (JSON.parse(raw) as { digest?: string; reason?: string })
          : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError("POST /v1/block: digest required", EXIT_FAIL);
        }
        const registryBefore = loadRegistry(projectRoot);
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
        sendJson(res, 200, {
          ok: true,
          action: "block",
          registry: loadRegistry(projectRoot),
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/kills") {
        const registry = loadRegistry(projectRoot);
        sendJson(res, 200, {
          kills: registry.kills,
          pauses: registry.pauses,
          blocked_update_ids: blockedUpdateIdsForRuntime(registry),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/kill") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw
          ? (JSON.parse(raw) as {
              business_module?: string;
              update_ids?: string[];
              reason?: string;
            })
          : {};
        const { registry, kill } = killModuleUpdates(projectRoot, {
          business_module: body.business_module ?? "",
          update_ids: body.update_ids ?? [],
          reason: body.reason,
          actor: cpRole,
        });
        sendJson(res, 200, {
          ok: true,
          action: "kill",
          kill,
          blocked_update_ids: blockedUpdateIdsForRuntime(registry),
          registry,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/pause") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw
          ? (JSON.parse(raw) as { business_module?: string; reason?: string })
          : {};
        const { registry, pause } = pauseModule(projectRoot, {
          business_module: body.business_module ?? "",
          reason: body.reason,
          actor: cpRole,
        });
        sendJson(res, 200, { ok: true, action: "pause", pause, registry });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/resume") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw
          ? (JSON.parse(raw) as { business_module?: string })
          : {};
        if (!body.business_module?.trim()) {
          throw new DeliveryError(
            "POST /v1/resume: business_module required",
            EXIT_FAIL,
          );
        }
        const registry = resumeModule(projectRoot, body.business_module);
        sendJson(res, 200, { ok: true, action: "resume", registry });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/rollouts") {
        const registry = loadRegistry(projectRoot);
        sendJson(res, 200, { rollouts: registry.rollouts });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/rollout/start") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw
          ? (JSON.parse(raw) as {
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
          actor: cpRole,
          min_soak_ms: body.min_soak_ms ?? resolveCpMinSoakMs(),
          sli_thresholds: body.sli_thresholds,
        });
        sendJson(res, 200, {
          ok: true,
          action: "rollout_start",
          rollout,
          registry,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/rollout/advance") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw
          ? (JSON.parse(raw) as {
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
        sendJson(res, 200, {
          ok: true,
          action: "rollout_advance",
          rollout,
          registry,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/rollout/pause") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw ? (JSON.parse(raw) as { digest?: string }) : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError(
            "POST /v1/rollout/pause: digest required",
            EXIT_FAIL,
          );
        }
        const { registry, rollout } = pauseRollout(projectRoot, body.digest);
        sendJson(res, 200, {
          ok: true,
          action: "rollout_pause",
          rollout,
          registry,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/rollout/resume") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw ? (JSON.parse(raw) as { digest?: string }) : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError(
            "POST /v1/rollout/resume: digest required",
            EXIT_FAIL,
          );
        }
        const { registry, rollout } = resumeRollout(projectRoot, body.digest);
        sendJson(res, 200, {
          ok: true,
          action: "rollout_resume",
          rollout,
          registry,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/rollout/slo-breach") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw
          ? (JSON.parse(raw) as { digest?: string; reason?: string })
          : {};
        if (!body.digest?.trim()) {
          throw new DeliveryError(
            "POST /v1/rollout/slo-breach: digest required",
            EXIT_FAIL,
          );
        }
        const { registry, rollout } = pauseRollout(projectRoot, body.digest);
        sendJson(res, 200, {
          ok: true,
          action: "rollout_slo_breach_pause",
          reason: body.reason?.trim() || "slo_breach",
          rollout,
          registry,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/rollout/tick") {
        if (!requireCpAuth()) return;
        const raw = await readBody(req);
        const body = raw
          ? (JSON.parse(raw) as {
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
        sendJson(res, 200, {
          ok: true,
          action: "rollout_tick",
          tick: result.action,
          detail: result.detail,
          rollout: result.state,
          registry,
        });
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
  });

  return {
    projectRoot,
    host,
    port,
    storage,
    serviceMode,
    listen: () =>
      new Promise((resolve, reject) => {
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
  console.error("  POST /v1/rollout/slo-breach { digest, reason } (C2 thin P10)");
  console.error("  POST /v1/rollout/tick { digest, sli?, now? } (C5 P10 auto)");
}

/** Map B thin CP — CLI-embedded serve (compat). */
export async function runServe(options: {
  cwd: string;
  port?: number;
  host?: string;
}): Promise<void> {
  const handle = createControlPlane({ ...options, serviceMode: "cli-serve" });
  await handle.listen();
  printBanner(handle, "rn-delivery serve");
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
  printBanner(handle, "rn-delivery cp-serve");
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
