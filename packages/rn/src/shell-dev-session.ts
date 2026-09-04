/**
 * Shell Metro session persistence + multi-port adb reverse (#158 follow-up).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import {
  type DevSessionConfig,
  extractPortFromMetroUrl,
  resolveShellMetroPreferredPort,
} from "@client-platform/rn-core";

import { loadDevSessionConfig } from "./dev-session-config.js";

export const SHELL_METRO_SESSION_RELATIVE = path.join(".rn", "shell-metro.session.json");

export type ShellMetroSession = {
  port: number;
  updatedAt: string;
};

export function shellMetroSessionPath(projectRoot: string): string {
  return path.join(projectRoot, SHELL_METRO_SESSION_RELATIVE);
}

export function readShellMetroSession(projectRoot: string): ShellMetroSession | null {
  const file = shellMetroSessionPath(projectRoot);
  if (!existsSync(file)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ShellMetroSession;
    if (!Number.isFinite(parsed.port) || parsed.port <= 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeShellMetroSession(projectRoot: string, port: number): string {
  const file = shellMetroSessionPath(projectRoot);
  mkdirSync(path.dirname(file), { recursive: true });
  const body: ShellMetroSession = {
    port,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return file;
}

export function resolveHostShellPreferredPort(
  projectRoot: string,
  explicitPort?: number,
): number {
  const config = loadDevSessionConfig(projectRoot);
  const persisted = readShellMetroSession(projectRoot);
  if (explicitPort == null && persisted?.port) {
    return resolveShellMetroPreferredPort(config, persisted.port);
  }
  return resolveShellMetroPreferredPort(config, explicitPort);
}

/** Unique ports to reverse for USB Dev Session (shell + broker + modules + live). */
export function collectDevSessionReversePorts(input: {
  shellPort: number;
  brokerPort: number;
  devSession?: DevSessionConfig | null;
  liveRecords?: Array<{ usbUrl: string; lanUrl?: string }>;
}): number[] {
  const ports = new Set<number>();
  ports.add(input.shellPort);
  ports.add(input.brokerPort);
  for (const binding of Object.values(input.devSession?.modules ?? {})) {
    ports.add(binding.metroPort);
  }
  for (const rec of input.liveRecords ?? []) {
    const usb = extractPortFromMetroUrl(rec.usbUrl);
    if (usb) ports.add(usb);
    if (rec.lanUrl) {
      const lan = extractPortFromMetroUrl(rec.lanUrl);
      if (lan) ports.add(lan);
    }
  }
  return [...ports].sort((a, b) => a - b);
}
