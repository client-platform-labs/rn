import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { blockCandidateInRegistry, listInstallableCandidates, loadRegistry } from "./candidate-store.js";
import { runPromote } from "./promote.js";
import { pickCandidate } from "./release-shared.js";
import { DeliveryError, EXIT_FAIL, resolveProjectRoot } from "./util.js";

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

/**
 * Map B / #7 thin CP: read-write HTTP over file registry (demo API).
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

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    try {
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
      console.error("  GET  /v1/candidates?lane=staging|production");
      console.error("  GET  /v1/registry | /staging | /production");
      console.error("  POST /v1/promote { digest } | /v1/block { digest, reason }");
      resolve();
    });
  });

  await new Promise(() => {
    /* keep alive until SIGINT */
  });
}
