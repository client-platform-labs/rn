import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  createQualitySignal,
  type QualitySignalAttribution,
  type QualitySignalKind,
} from "@client-platform/rn-core";

import { ensureDeliveryDir } from "./candidate-store.js";
import { DeliveryError, EXIT_FAIL, EXIT_USAGE } from "./util.js";

export const QUALITY_SIGNALS_FILE = "quality-signals.json";

export type QualitySignalStore = {
  schemaVersion: 1;
  signals: QualitySignalAttribution[];
};

export function qualitySignalsPath(projectRoot: string): string {
  return path.join(ensureDeliveryDir(projectRoot), QUALITY_SIGNALS_FILE);
}

export function emptyQualitySignalStore(): QualitySignalStore {
  return { schemaVersion: 1, signals: [] };
}

export function loadQualitySignals(projectRoot: string): QualitySignalStore {
  const file = qualitySignalsPath(projectRoot);
  if (!existsSync(file)) return emptyQualitySignalStore();
  return JSON.parse(readFileSync(file, "utf8")) as QualitySignalStore;
}

export function saveQualitySignals(
  projectRoot: string,
  store: QualitySignalStore,
): void {
  writeFileSync(
    qualitySignalsPath(projectRoot),
    `${JSON.stringify(store, null, 2)}\n`,
  );
}

export function appendQualitySignal(
  projectRoot: string,
  signal: QualitySignalAttribution,
): QualitySignalStore {
  const store = loadQualitySignals(projectRoot);
  store.signals.push(signal);
  saveQualitySignals(projectRoot, store);
  return store;
}

const KINDS: QualitySignalKind[] = [
  "crash",
  "js_error",
  "anr",
  "perf",
  "custom",
  "e2e_fail",
];

export function parseSignalKind(raw: string | undefined): QualitySignalKind {
  if (!raw || !KINDS.includes(raw as QualitySignalKind)) {
    throw new DeliveryError(
      `signal kind must be one of: ${KINDS.join(", ")}`,
      EXIT_USAGE,
    );
  }
  return raw as QualitySignalKind;
}

export async function runSignalRecord(options: {
  cwd: string;
  module: string;
  updateId: string;
  kind: string;
  detail?: string;
  digest?: string;
  releaseId?: string;
}): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  const signal = createQualitySignal({
    kind: parseSignalKind(options.kind),
    business_module: options.module.trim(),
    update_id: options.updateId.trim(),
    detail: options.detail,
    artifact_digest: options.digest?.trim() || undefined,
    release_id: options.releaseId?.trim() || undefined,
  });
  const store = appendQualitySignal(projectRoot, signal);
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "record_quality_signal",
        signal,
        total: store.signals.length,
        path: qualitySignalsPath(projectRoot),
      },
      null,
      2,
    ),
  );
}

export async function runSignalList(options: { cwd: string }): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  const store = loadQualitySignals(projectRoot);
  console.log(JSON.stringify(store, null, 2));
}

export async function runSignalClear(options: { cwd: string }): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  saveQualitySignals(projectRoot, emptyQualitySignalStore());
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "clear_quality_signals",
        path: qualitySignalsPath(projectRoot),
      },
      null,
      2,
    ),
  );
}
