import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

export function findWorkspaceRoot(cwd: string): string | undefined {
  let dir = path.resolve(cwd);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

export function parseWorkspacePackageGlobs(yaml: string): string[] {
  const globs: string[] = [];
  let inPackages = false;
  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    if (!inPackages) {
      if (line.startsWith("packages:")) {
        inPackages = true;
      }
      continue;
    }
    if (!line.startsWith("-")) {
      break;
    }
    const value = line.slice(1).trim().replace(/^['"]|['"]$/g, "");
    if (value) {
      globs.push(value);
    }
  }
  return globs;
}

export async function listWorkspacePackageJsonFiles(
  workspaceRoot: string,
): Promise<string[]> {
  const yaml = readFileSync(path.join(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
  const globs = parseWorkspacePackageGlobs(yaml);
  const files: string[] = [];
  for (const glob of globs) {
    files.push(...(await expandWorkspaceGlob(workspaceRoot, glob)));
  }
  return files;
}

async function expandWorkspaceGlob(root: string, glob: string): Promise<string[]> {
  const normalized = glob.replace(/\\/g, "/");
  if (normalized.endsWith("/*")) {
    const dir = path.join(root, normalized.slice(0, -2));
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => path.join(dir, entry.name, "package.json"));
  }
  if (!normalized.includes("*")) {
    return [path.join(root, normalized, "package.json")];
  }
  return [];
}
