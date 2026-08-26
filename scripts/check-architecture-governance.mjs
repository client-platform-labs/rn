#!/usr/bin/env node
/**
 * Architecture governance CI gate (ADR-009).
 * @see docs/agents/architecture-governance.md
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const PRINCIPLES_MARKER = "## Principles compliance";
const ADR_DIR = path.join(REPO_ROOT, "wayfinding-impl-2/docs/adr");
const PRINCIPLES_DOC = path.join(REPO_ROOT, "docs/agents/engineering-principles.md");
const GOVERNANCE_DOC = path.join(REPO_ROOT, "docs/agents/architecture-governance.md");
const ADR_009 = path.join(ADR_DIR, "009-architecture-principles-governance.md");

const FORBIDDEN_PRODUCT_PATTERNS = [
  {
    id: "fake-delivery-seal",
    roots: [path.join(REPO_ROOT, "packages/rn/src")],
    re: /\bmodule\s+seal\b|sealModule|module-bundle-seal/i,
    hint: "withdrawn fake delivery — use rn-delivery + control plane",
  },
  {
    id: "dev-metro-as-release",
    roots: [path.join(REPO_ROOT, "packages/rn/src/commands")],
    re: /\.rn\/bundles|dev=true.*release|curl.*8081.*artifact/i,
    hint: "dev Metro must not be presented as release artifact in CLI",
  },
];

function walkFiles(dir, out, depth = 0) {
  if (depth > 12 || !existsSync(dir)) return;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === "node_modules" || name.name === "dist") continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walkFiles(full, out, depth + 1);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name.name)) out.push(full);
  }
}

export function checkArchitectureGovernance(root = REPO_ROOT) {
  const errors = [];

  for (const doc of [PRINCIPLES_DOC, GOVERNANCE_DOC, ADR_009]) {
    if (!existsSync(doc)) {
      errors.push(`missing normative doc: ${path.relative(root, doc)}`);
    }
  }

  if (existsSync(ADR_DIR)) {
    for (const name of readdirSync(ADR_DIR)) {
      if (!name.endsWith(".md") || name === "000-template.md") continue;
      const full = path.join(ADR_DIR, name);
      const body = readFileSync(full, "utf8");
      if (!body.includes(PRINCIPLES_MARKER)) {
        errors.push(
          `ADR ${name}: missing "${PRINCIPLES_MARKER}" (see 000-template.md)`,
        );
      }
    }
  } else {
    errors.push("missing ADR directory");
  }

  for (const rule of FORBIDDEN_PRODUCT_PATTERNS) {
    for (const rootDir of rule.roots) {
      const files = [];
      walkFiles(rootDir, files);
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        if (rule.re.test(src)) {
          errors.push(
            `${rule.id}: ${path.relative(REPO_ROOT, file)} — ${rule.hint}`,
          );
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const result = checkArchitectureGovernance();
  if (result.ok) {
    console.log("architecture-governance: PASS");
    return;
  }
  console.error("architecture-governance: FAIL");
  for (const err of result.errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
