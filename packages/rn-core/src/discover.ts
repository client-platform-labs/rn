import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { HOST_SUPPORTED_API_VERSIONS, type PluginKind, type PluginRecord } from "./types.js";
import {
  findWorkspaceRoot,
  listWorkspacePackageJsonFiles,
} from "./workspace.js";

const PLUGIN_KINDS = new Set<PluginKind>(["cli-command", "native", "prebuild"]);

export interface DiscoverPluginsOptions {
  cwd?: string;
  supportedApiVersions?: readonly number[];
  onWarn?: (message: string) => void;
}

export async function discoverPlugins(
  options: DiscoverPluginsOptions = {},
): Promise<PluginRecord[]> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const supported = new Set(
    options.supportedApiVersions ?? HOST_SUPPORTED_API_VERSIONS,
  );
  const onWarn = options.onWarn ?? (() => {});

  const packageJsonFiles = await collectPackageJsonFiles(cwd);
  const records: PluginRecord[] = [];

  for (const file of packageJsonFiles) {
    const record = readPluginRecord(file, supported, onWarn);
    if (record) {
      records.push(record);
    }
  }

  return records;
}

async function collectPackageJsonFiles(cwd: string): Promise<string[]> {
  const workspaceRoot = findWorkspaceRoot(cwd);
  if (workspaceRoot) {
    return listWorkspacePackageJsonFiles(workspaceRoot);
  }
  const local = path.join(cwd, "package.json");
  return existsSync(local) ? [local] : [];
}

function readPluginRecord(
  packageJsonPath: string,
  supported: Set<number>,
  onWarn: (message: string) => void,
): PluginRecord | undefined {
  if (!existsSync(packageJsonPath)) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    onWarn(`skipping ${packageJsonPath}: invalid JSON`);
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const pkg = parsed as Record<string, unknown>;
  if (!("clientPlatform" in pkg)) {
    return undefined;
  }
  const packageName =
    typeof pkg.name === "string" && pkg.name ? pkg.name : path.basename(path.dirname(packageJsonPath));
  const packageRoot = path.dirname(packageJsonPath);
  return parseClientPlatform(pkg.clientPlatform, packageName, packageRoot, supported, onWarn);
}

function parseClientPlatform(
  value: unknown,
  packageName: string,
  packageRoot: string,
  supported: Set<number>,
  onWarn: (message: string) => void,
): PluginRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    onWarn(`${packageName}: clientPlatform must be an object`);
    return undefined;
  }
  const fields = value as Record<string, unknown>;
  const id = fields.id;
  const kind = fields.kind;
  const apiVersion = fields.apiVersion;
  const exportPath = fields.export;

  if (typeof id !== "string" || id.length === 0) {
    onWarn(`${packageName}: clientPlatform.id is required`);
    return undefined;
  }
  if (typeof kind !== "string" || !PLUGIN_KINDS.has(kind as PluginKind)) {
    onWarn(`${packageName}: skipping plugin ${id} (unsupported kind ${String(kind)})`);
    return undefined;
  }
  if (typeof apiVersion !== "number" || !Number.isInteger(apiVersion)) {
    onWarn(`${packageName}: clientPlatform.apiVersion must be an integer`);
    return undefined;
  }
  if (!supported.has(apiVersion)) {
    onWarn(
      `${packageName}: skipping plugin ${id} (apiVersion ${apiVersion} not supported; host supports ${[...supported].join(", ")})`,
    );
    return undefined;
  }
  if (typeof exportPath !== "string" || exportPath.length === 0) {
    onWarn(`${packageName}: clientPlatform.export is required`);
    return undefined;
  }

  return {
    id,
    kind: kind as PluginKind,
    apiVersion,
    export: exportPath,
    packageName,
    packageRoot,
  };
}
