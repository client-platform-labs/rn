import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  findManifestRoot,
  loadProjectManifest,
  MANIFEST_FILENAME,
  type ProjectManifest,
} from "@client-platform/rn-core";

export const EXIT_OK = 0;
export const EXIT_FAIL = 1;
export const EXIT_USAGE = 2;

export class DeliveryError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "DeliveryError";
    this.exitCode = exitCode;
  }
}

export function commandExists(command: string): boolean {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], { encoding: "utf8" });
  return result.status === 0;
}

export async function runStreaming(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export function findAndroidSdkRoot(): string | undefined {
  const fromEnv =
    process.env.ANDROID_HOME?.trim() || process.env.ANDROID_SDK_ROOT?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  const home = process.env.HOME;
  if (!home) return undefined;
  const candidates = [
    path.join(home, "Library", "Android", "sdk"),
    path.join(home, "Android", "Sdk"),
  ];
  return candidates.find((p) => existsSync(p));
}

export function resolveProjectRoot(cwd: string): string {
  const root = findManifestRoot(cwd);
  if (root) return root;
  if (existsSync(path.join(cwd, "package.json"))) {
    return path.resolve(cwd);
  }
  throw new DeliveryError(
    `No ${MANIFEST_FILENAME} or package.json — run from an rn init project`,
    EXIT_FAIL,
  );
}

export function loadManifestOrEmpty(projectRoot: string): {
  manifest?: ProjectManifest;
  releaseId: string;
} {
  const loaded = loadProjectManifest(projectRoot);
  if (loaded.ok) {
    return {
      manifest: loaded.manifest,
      releaseId: loaded.manifest.release_id ?? "unknown-release",
    };
  }
  return { releaseId: "unknown-release" };
}

export function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

export function findNewestApk(androidDir: string): string | undefined {
  const outputs = path.join(androidDir, "app", "build", "outputs", "apk");
  if (!existsSync(outputs)) return undefined;
  const found: Array<{ path: string; mtime: number }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".apk")) {
        found.push({ path: full, mtime: statSync(full).mtimeMs });
      }
    }
  };
  walk(outputs);
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0]?.path;
}

export function findXcodeScheme(iosDir: string): string | undefined {
  const entries = readdirSync(iosDir);
  const xcodeproj = entries.find((e) => e.endsWith(".xcodeproj"));
  if (xcodeproj) {
    return path.basename(xcodeproj, ".xcodeproj");
  }
  return undefined;
}

export function findWorkspaceOrProject(iosDir: string): {
  type: "workspace" | "project";
  path: string;
} | undefined {
  const entries = readdirSync(iosDir);
  const workspace = entries.find((e) => e.endsWith(".xcworkspace"));
  if (workspace) {
    return { type: "workspace", path: path.join(iosDir, workspace) };
  }
  const project = entries.find((e) => e.endsWith(".xcodeproj"));
  if (project) {
    return { type: "project", path: path.join(iosDir, project) };
  }
  return undefined;
}
