/**
 * Local Catalog Service HTTP API (P2 consumer for Debug Host).
 * GET  /v1/products/:productApp/modules
 * POST /v1/products/:productApp/publish  { modules }
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type { CatalogModuleEntry } from "@client-platform/rn-core";

import { CatalogStore } from "./store.js";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(body)}\n`);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export type CatalogServiceHandle = {
  server: Server;
  store: CatalogStore;
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startCatalogService(options: {
  store?: CatalogStore;
  host?: string;
  port?: number;
}): Promise<CatalogServiceHandle> {
  const store = options.store ?? new CatalogStore();
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}`);
      const parts = url.pathname.split("/").filter(Boolean);
      // /v1/products/:app/modules | publish
      if (
        parts.length === 4 &&
        parts[0] === "v1" &&
        parts[1] === "products" &&
        parts[3] === "modules" &&
        req.method === "GET"
      ) {
        const productApp = decodeURIComponent(parts[2]!);
        const doc = store.read(productApp);
        if (!doc) {
          sendJson(res, 404, { error: "catalog_not_found", productApp });
          return;
        }
        sendJson(res, 200, doc);
        return;
      }
      if (
        parts.length === 4 &&
        parts[0] === "v1" &&
        parts[1] === "products" &&
        parts[3] === "publish" &&
        req.method === "POST"
      ) {
        const productApp = decodeURIComponent(parts[2]!);
        const raw = await readBody(req);
        let body: { modules?: CatalogModuleEntry[] };
        try {
          body = JSON.parse(raw) as { modules?: CatalogModuleEntry[] };
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        if (!Array.isArray(body.modules)) {
          sendJson(res, 400, { error: "modules_required" });
          return;
        }
        try {
          const doc = store.publish({ productApp, modules: body.modules });
          sendJson(res, 200, doc);
        } catch (err) {
          sendJson(res, 400, {
            error: "publish_rejected",
            message: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }
      sendJson(res, 404, { error: "not_found" });
    } catch (err) {
      sendJson(res, 500, {
        error: "internal",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const address = server.address();
  const boundPort =
    typeof address === "object" && address ? address.port : Number(port);
  const baseUrl = `http://${host}:${boundPort}`;

  return {
    server,
    store,
    port: boundPort,
    baseUrl,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Fetch catalog document from a Catalog Service baseUrl (P2). */
export async function fetchCatalogModules(options: {
  baseUrl: string;
  productApp: string;
}): Promise<Response> {
  const url = `${options.baseUrl.replace(/\/$/, "")}/v1/products/${encodeURIComponent(options.productApp)}/modules`;
  return fetch(url);
}
