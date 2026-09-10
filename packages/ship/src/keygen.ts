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
import { spawnSync } from "node:child_process";
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

/**
 * ADR-024 (D3): generate an X.509 Ed25519 certificate chain — a self-signed
 * root CA and a leaf cert signed by it. Returns leaf/RCA cert PEMs + RCA
 * public key hex (for baking into the APK). Requires openssl (ship runs on
 * dev/CI hosts, not the device). Stage-1 cert material for the trust model.
 */
export function runKeygenCertChain(options: {
  dir: string;
  label: string;
}): {
  dir: string;
  leafCertFile: string;
  rcaCertFile: string;
  rcaPubkeyHex: string;
} {
  const dir = options.dir;
  const label = options.label ?? "lab-sign-key";
  const rcaKey = path.join(dir, `${label}.rca.key`);
  const rcaCrt = path.join(dir, `${label}.rca.crt`);
  const leafKey = path.join(dir, `${label}.key`);
  const leafCsr = path.join(dir, `${label}.csr`);
  const leafCrt = path.join(dir, `${label}.leaf.crt`);
  const run = (args: string[]): string => {
    const r = spawnSync("openssl", args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) {
      throw new Error(`openssl ${args.join(" ")} failed: ${r.stderr?.slice(0, 300)}`);
    }
    return r.stdout;
  };
  run(["req", "-x509", "-newkey", "ed25519", "-keyout", rcaKey, "-out", rcaCrt, "-days", "3650", "-subj", "/CN=client-platform-root-ca", "-nodes"]);
  run(["req", "-newkey", "ed25519", "-keyout", leafKey, "-out", leafCsr, "-nodes", "-subj", `/CN=${label}`]);
  run(["x509", "-req", "-in", leafCsr, "-CA", rcaCrt, "-CAkey", rcaKey, "-CAcreateserial", "-out", leafCrt, "-days", "365"]);
  chmodSync(leafKey, 0o600);
  // RCA raw Ed25519 public key = last 32 bytes of its SPKI DER (NOT the cert
  // DER — the cert ends with the signature, not the key).
  const pubPem = spawnSync(
    "openssl",
    ["x509", "-in", rcaCrt, "-pubkey", "-noout"],
    { encoding: "utf8" },
  );
  const der = spawnSync(
    "openssl",
    ["pkey", "-pubin", "-outform", "DER"],
    { input: pubPem.stdout },
  );
  const raw = der.stdout as unknown as Uint8Array;
  const rcaPubkeyHex = Array.from(raw.subarray(raw.length - 32))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { dir, leafCertFile: leafCrt, rcaCertFile: rcaCrt, rcaPubkeyHex };
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
