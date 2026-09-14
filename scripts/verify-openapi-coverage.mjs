#!/usr/bin/env node
/**
 * CP API contract drift probe (map-j/T1, #290).
 *
 * The Distribution Service's openapi spec is the contract enterprises use to
 * self-implement or integrate with the control plane. It must cover every route
 * the server actually serves, or an enterprise reading the spec builds against
 * a surface that does not exist (or misses one that does).
 *
 * This probe derives the route set from `serve.ts` (the route table is the
 * source of truth) and checks the openapi path/method coverage. Any route the
 * spec does not cover is a FAIL.
 *
 * Usage:
 *   node scripts/verify-openapi-coverage.mjs
 *
 * Exit: 0 = coverage complete, 1 = missing routes (list them).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const SERVE_SRC = path.join(REPO_ROOT, "packages/ship/src/serve.ts");
const OPENAPI = path.join(REPO_ROOT, "docs/specs/distribution-service.openapi.yaml");

/**
 * Regex-path routes in serve.ts → the openapi path template(s) they serve.
 * Four routes use regex literals; everything else is a plain string literal.
 * The portal wildcard is intentionally scoped to `/portal` (sub-paths are the
 * console's own static assets, not part of the API contract).
 */
/**
 * Build the serve.ts regex-literal form of a path template key.
 */
const rx = (s) => "/^" + s.replace(/\//g, "\\/") + "$/";
const REGEX_TEMPLATES = new Map([
  [rx("/(console)?"), ["/", "/console"]],
  [rx("/portal(/.*)?"), ["/portal"]],
  [rx("/v1/artifacts/([^/]+)"), ["/v1/artifacts/{digest}"]],
  [rx("/v1/devices/([^/]+)/lane"), ["/v1/devices/{serial}/lane"]],
]);

/** Extract `{method, path}` route declarations from serve.ts's route table. */
function extractRoutes(src) {
  const routes = [];
  const re = /method: "(\w+)",\s*\n\s*path: ([^,\n]+),/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const raw = m[2].trim();
    if (raw.startsWith("url.pathname")) continue; // audit()/dispatch(), not a route
    const p = raw.startsWith('"') ? raw.slice(1, -1) : raw;
    routes.push({ method: m[1], path: p });
  }
  return routes;
}

/** Route → openapi path template(s). */
function templatesFor(route) {
  if (route.path.startsWith("/^")) {
    return REGEX_TEMPLATES.get(route.path) ?? [];
  }
  return [route.path];
}

/** Does the openapi declare `method` under path key `openapiPath`? */
function pathHasMethod(yaml, openapiPath, method) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l === `  ${openapiPath}:`);
  if (start < 0) return false;
  for (let j = start + 1; j < lines.length; j += 1) {
    const l = lines[j];
    // next depth-2 key ends this path block
    if (/^  \S/.test(l) && l.includes(":")) return false;
    if (l === `    ${method}:`) return true;
  }
  return false;
}

function main() {
  const src = readFileSync(SERVE_SRC, "utf8");
  const yaml = readFileSync(OPENAPI, "utf8");
  const routes = extractRoutes(src);

  const missing = [];
  for (const r of routes) {
    const method = r.method.toLowerCase();
    for (const op of templatesFor(r)) {
      if (!pathHasMethod(yaml, op, method)) {
        missing.push(`${r.method} ${r.path}  ->  ${method} ${op}`);
      }
    }
  }

  const covered = routes.length - missing.length;
  console.log(
    `openapi coverage: ${covered}/${routes.length} routes covered`,
  );
  if (missing.length > 0) {
    console.log("MISSING from docs/specs/distribution-service.openapi.yaml:");
    for (const line of missing) console.log(`  ${line}`);
    process.exitCode = 1;
  } else {
    console.log("openapi coverage: COMPLETE");
  }
}

main();
