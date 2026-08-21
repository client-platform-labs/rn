/**
 * Product install layout (rustup-style home).
 * Override: CLIENT_PLATFORM_RN_HOME
 */
import { existsSync, lstatSync, readlinkSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROFILE_MARKER = "# client-platform-rn-cli";

export function defaultInstallHome(): string {
  return (
    process.env.CLIENT_PLATFORM_RN_HOME?.trim() ||
    path.join(homedir(), ".client-platform", "rn")
  );
}

export function localBinDir(): string {
  return path.join(homedir(), ".local", "bin");
}

export function envFilePath(): string {
  return path.join(homedir(), ".config", "client-platform", "rn-env.sh");
}

/** Directory containing this running CLI package (…/packages/rn). */
export function runningPackageRoot(): string {
  return path.resolve(fileURLToPath(new URL("..", import.meta.url)));
}

/** Repo / install root (parent of packages/). */
export function runningRepoRoot(): string {
  return path.resolve(runningPackageRoot(), "..", "..");
}

export function isManagedInstall(home = defaultInstallHome()): boolean {
  try {
    const repo = runningRepoRoot();
    return realpathSync(repo) === realpathSync(home);
  } catch {
    return false;
  }
}

export function resolveBinSymlinkTarget(name: "rn" | "rn-delivery"): string | null {
  const link = path.join(localBinDir(), name);
  try {
    if (!existsSync(link) || !lstatSync(link).isSymbolicLink()) {
      return null;
    }
    return realpathSync(readlinkSync(link));
  } catch {
    return null;
  }
}
