/**
 * SEAM-1/F01: `ship keygen` — first-class lab signing-key provisioning for the
 * release-owner persona (one command, no node/openssl one-liners).
 *
 * Writes to a canonical keys directory (default ~/.client-platform/keys,
 * --dir override), private key 0600, prints the Ed25519 public key hex for
 * baking (F02), and the RN_DELIVERY_SIGN_KEY_FILE injection guidance.
 * Production signing stays HITL (ADR-018 / D3: offline, off-machine); this is
 * the lab/automation supply path.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateLabEd25519Pem } from "./signature.js";

export const DEFAULT_KEYS_DIR = path.join(
  os.homedir(),
  ".client-platform",
  "keys",
);

function pubkeyHexFromPem(publicKeyPem: string): string {
  const der = Buffer.from(
    publicKeyPem
      .split("\n")
      .filter((l) => !l.includes("PUBLIC KEY"))
      .join(""),
    "base64",
  );
  // ed25519 raw public key = last 32 bytes of the SPKI structure
  // (matches `openssl pkey -pubout -outform DER | tail -c 32`).
  return der.subarray(der.length - 32).toString("hex");
}

export function runKeygen(options: {
  dir?: string;
  label?: string;
}): { dir: string; keyFile: string; pubHex: string } {
  const dir = path.resolve(options.dir ?? DEFAULT_KEYS_DIR);
  mkdirSync(dir, { recursive: true });
  const { privateKeyPem, publicKeyPem } = generateLabEd25519Pem();
  const label = options.label ?? "lab-sign-key";
  const keyFile = path.join(dir, `${label}.pem`);
  const pubFile = path.join(dir, `${label}.pub.pem`);
  writeFileSync(keyFile, privateKeyPem, "utf8");
  writeFileSync(pubFile, publicKeyPem, "utf8");
  chmodSync(keyFile, 0o600);
  const pubHex = pubkeyHexFromPem(publicKeyPem);
  return { dir, keyFile, pubHex };
}

export function printKeygenResult(r: {
  dir: string;
  keyFile: string;
  pubHex: string;
}): void {
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "keygen",
        key_file: r.keyFile,
        keys_dir: r.dir,
        public_key_hex: r.pubHex,
        next: [
          `bake: apply-ota --pubkey-hex ${r.pubHex}`,
          `sign: export RN_DELIVERY_SIGN_KEY_FILE=${r.keyFile}`,
        ],
      },
      null,
      2,
    ),
  );
}

export function keysDirIsManaged(dir: string): boolean {
  return existsSync(path.join(dir, "lab-sign-key.pem"));
}
