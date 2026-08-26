import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  blockCandidateInRegistry,
  listInstallableCandidates,
  loadRegistry,
} from "./candidate-store.js";
import { checkCpBearerAuth, checkCpMutatingRole, resolveCpAuthToken, resolveCpRole } from "./cp-auth.js";
import { runPromote } from "./promote.js";
import { pickCandidate } from "./release-shared.js";
import { DeliveryError, EXIT_FAIL, resolveProjectRoot } from "./util.js";

const STATIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../static",
);

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

function loadConsoleHtml(): string {
  return readFileSync(path.join(STATIC_DIR, "cp-console.html"), "utf8");
}

/**
 * Map B / #7 thin CP: read-write HTTP over file registry (demo API + Web).
 * Not production CP — replaces curl to rn-delivery for Web console PoC.
 */
export async function runServe(options: {
  cwd: string;
  port?: number;
  host?: string;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  const port = options.port ?? 4040;
  const host = options.host ?? "127.0.0.1";
  const cpAuthToken = resolveCpAuthToken();
  const cpRole = resolveCpRole();

  const server = createServer(async (req, res) => {
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
        sendHtml(res, 200, loadConsoleHtml());
        return;
      }

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true, projectRoot });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/candidates") {
        const lane = url.searchParams.get("lane");
        const laneFilter =
          lane === "staging" || lane === "production" ? lane : "all";
        const registry = loadRegistry(projectRoot);
        sendJson(res, 200, {
          candidates: listInstallableCandidates(registry, laneFilter),
        });
        return;
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

      sendJson(res, 404, { error: "not_found", path: url.pathname });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof DeliveryError ? err.exitCode : EXIT_FAIL;
      sendJson(res, code === EXIT_FAIL ? 400 : 500, { error: message });
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      console.error(
        `rn-delivery serve: http://${host}:${port} (project ${projectRoot})`,
      );
      console.error("  GET  /  (thin CP Web console)");
      console.error("  GET  /v1/candidates?lane=staging|production");
      console.error("  GET  /v1/registry | /staging | /production");
      console.error(
        "  POST /v1/promote { digest } | /v1/block { digest, reason }",
      );
      if (cpAuthToken) {
        console.error("  CP auth: RN_CP_TOKEN set — mutating routes require Bearer");
      }
      if (cpAuthToken && cpRole === "viewer") {
        console.error("  CP role: viewer — POST promote/block disabled (GET read-only)");
      }
      if (process.env.RN_CP_REGISTRY?.trim().toLowerCase() === "sqlite") {
        console.error("  CP registry: SQLite (.rn/delivery/registry.sqlite)");
      }
      resolve();
    });
  });

  await new Promise(() => {
    /* keep alive until SIGINT */
  });
}
