import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type {
  ComplianceProfile,
  ExceptionLedgerEntry,
} from "@client-platform/rn-core";

import { DELIVERY_STATE_DIR } from "./candidate-store.js";

export const EXCEPTION_LEDGER_FILE = "exception-ledger.json";
export const COMPLIANCE_PROFILE_FILE = "compliance-profile.json";

export type ExceptionLedgerStore = {
  schemaVersion: 1;
  entries: ExceptionLedgerEntry[];
};

export type ComplianceProfileStore = {
  schemaVersion: 1;
  profile: ComplianceProfile;
};

function stateDir(projectRoot: string): string {
  return path.join(projectRoot, DELIVERY_STATE_DIR);
}

export function loadExceptionLedger(projectRoot: string): ExceptionLedgerStore {
  const file = path.join(stateDir(projectRoot), EXCEPTION_LEDGER_FILE);
  if (!existsSync(file)) {
    return { schemaVersion: 1, entries: [] };
  }
  return JSON.parse(readFileSync(file, "utf8")) as ExceptionLedgerStore;
}

export function saveExceptionLedger(
  projectRoot: string,
  store: ExceptionLedgerStore,
): void {
  const dir = stateDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, EXCEPTION_LEDGER_FILE),
    `${JSON.stringify(store, null, 2)}\n`,
  );
}

export function loadComplianceProfileStore(
  projectRoot: string,
): ComplianceProfile | null {
  const file = path.join(stateDir(projectRoot), COMPLIANCE_PROFILE_FILE);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as ComplianceProfileStore;
  return raw.profile ?? null;
}

export function saveComplianceProfileStore(
  projectRoot: string,
  profile: ComplianceProfile,
): void {
  const dir = stateDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, COMPLIANCE_PROFILE_FILE),
    `${JSON.stringify({ schemaVersion: 1, profile }, null, 2)}\n`,
  );
}
