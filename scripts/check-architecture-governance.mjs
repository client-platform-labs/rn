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
const ADR_DIRS = [
  path.join(REPO_ROOT, "wayfinding-impl-2/docs/adr"),
  path.join(REPO_ROOT, "docs/adr"),
];
const PRINCIPLES_DOC = path.join(REPO_ROOT, "docs/agents/engineering-principles.md");
const GOVERNANCE_DOC = path.join(REPO_ROOT, "docs/agents/architecture-governance.md");
const ADR_009 = path.join(REPO_ROOT, "wayfinding-impl-2/docs/adr", "009-architecture-principles-governance.md");

const FORBIDDEN_PRODUCT_PATTERNS = [
  {
    id: "fake-delivery-seal",
    roots: [path.join(REPO_ROOT, "packages/rn/src")],
    re: /\bmodule\s+seal\b|sealModule|module-bundle-seal/i,
    hint: "withdrawn fake delivery — use ship + control plane",
  },
  {
    id: "dev-metro-as-release",
    roots: [path.join(REPO_ROOT, "packages/rn/src/commands")],
    re: /\.rn\/bundles|dev=true.*release|curl.*8081.*artifact/i,
    hint: "dev Metro must not be presented as release artifact in CLI",
  },
];

/**
 * ADR-021 dependency DAG (upward-only, no reverse).
 * Key = package folder name (legacy names kept during expand–contract).
 * Value = the @client-platform/* packages it MAY import.
 */
const DEPENDENCY_DAG = {
  core: [],
  "rn-engine": ["core"],
  "shell-core": ["core"],
  rn: ["core", "rn-engine"],
  ship: ["core", "rn-engine"],
};

/** Engine-agnostic packages that must never import the RN runtime (ADR-022). */
const ENGINE_AGNOSTIC_PACKAGES = ["core", "rn-core", "shell-core"];

const INTERNAL_IMPORT_RE =
  /(?:from\s+|import\s*\(\s*)["']@client-platform\/([^"'/]+)["']/g;

const RN_RUNTIME_IMPORT_RE =
  /(?:from\s*["']react-native["']|require\(\s*["']react-native["']\s*\)|import\s*["']react-native["'])/;

/**
 * ADR-021: enforce upward-only internal imports across packages/* and plugins/*.
 * plugins/* may only import the contract package (core / rn-core).
 */
export function checkImportDirection(root = REPO_ROOT) {
  const errors = [];
  for (const [dirPath, pluginMode] of [
    [path.join(root, "packages"), false],
    [path.join(root, "plugins"), true],
  ]) {
    if (!existsSync(dirPath)) continue;
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgName = entry.name;
      const srcDir = path.join(dirPath, pkgName, "src");
      if (!existsSync(srcDir)) continue;
      const allowed = pluginMode
        ? ["core", "rn-core"]
        : (DEPENDENCY_DAG[pkgName] ?? []);
      const files = [];
      walkFiles(srcDir, files);
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(INTERNAL_IMPORT_RE)) {
          const target = m[1];
          if (!allowed.includes(target)) {
            errors.push(
              `import-direction: ${path.relative(root, file)} imports @client-platform/${target} (forbidden for ${pkgName})`,
            );
          }
        }
      }
    }
  }
  return errors;
}

/**
 * ADR-022: engine-agnostic packages (core / shell-core) must not import react-native.
 */

export function checkEngineAgnosticPurity(root = REPO_ROOT) {
  const errors = [];
  for (const pkgName of ENGINE_AGNOSTIC_PACKAGES) {
    const srcDir = path.join(root, "packages", pkgName, "src");
    if (!existsSync(srcDir)) continue;
    const files = [];
    walkFiles(srcDir, files);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (RN_RUNTIME_IMPORT_RE.test(src)) {
        errors.push(
          `engine-agnostic: ${path.relative(root, file)} imports react-native (${pkgName} must stay engine-agnostic)`,
        );
      }
    }
  }
  return errors;
}

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

  for (const adrDir of ADR_DIRS) {
    if (!existsSync(adrDir)) {
      errors.push(`missing ADR directory: ${path.relative(REPO_ROOT, adrDir)}`);
      continue;
    }
    for (const name of readdirSync(adrDir)) {
      if (!name.endsWith(".md") || name === "000-template.md") continue;
      const full = path.join(adrDir, name);
      const body = readFileSync(full, "utf8");
      if (!body.includes(PRINCIPLES_MARKER)) {
        errors.push(
          `ADR ${name}: missing "${PRINCIPLES_MARKER}" (see 000-template.md)`,
        );
      }
    }
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

  // ADR-021/022: dependency direction + engine-agnostic purity
  errors.push(...checkImportDirection(root));
  errors.push(...checkEngineAgnosticPurity(root));

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
