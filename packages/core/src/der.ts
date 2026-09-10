/**
 * ADR-024 (D3): minimal DER (ASN.1) reader — the subset needed to verify
 * Ed25519 X.509 certificates on-device (Hermes-safe, pure JS, @noble-based).
 *
 * This is intentionally NOT a general ASN.1 parser: it walks the X.509
 * `Certificate` structure just enough to extract (a) the TBSCertificate bytes,
 * (b) the subjectPublicKeyInfo → raw Ed25519 public key, (c) the BIT STRING
 * signatureValue. Used by cert-chain.ts (leaf → root-CA verification).
 */
export type DerNode = {
  /** DER tag byte (e.g. 0x30 SEQUENCE, 0x03 BIT STRING, 0x02 INTEGER). */
  tag: number;
  /** DER content octets (after tag+length). */
  content: Uint8Array;
  /** Absolute byte offset of the tag in the input. */
  start: number;
  /** Absolute byte offset one past the content. */
  end: number;
};

function readLength(bytes: Uint8Array, offset: number): { length: number; next: number } {
  const first = bytes[offset];
  if (first === undefined) throw new Error("der: unexpected end at length");
  if ((first & 0x80) === 0) {
    return { length: first, next: offset + 1 };
  }
  const n = first & 0x7f;
  if (n === 0 || n > 4) throw new Error(`der: unsupported long-form length (${n})`);
  let length = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[offset + 1 + i];
    if (b === undefined) throw new Error("der: unexpected end in long length");
    length = length * 256 + b;
  }
  return { length, next: offset + 1 + n };
}

/** Read one DER node at `offset`; returns the node + the offset after its content. */
export function readDerNode(bytes: Uint8Array, offset: number): { node: DerNode; next: number } {
  const tag = bytes[offset];
  if (tag === undefined) throw new Error("der: unexpected end at tag");
  const { length, next: lenNext } = readLength(bytes, offset + 1);
  const contentStart = lenNext;
  const contentEnd = contentStart + length;
  if (contentEnd > bytes.length) throw new Error("der: content exceeds input");
  return {
    node: { tag, content: bytes.subarray(contentStart, contentEnd), start: offset, end: contentEnd },
    next: contentEnd,
  };
}

/** Parse the children of a constructed node's content (SEQUENCE / SET). */
export function derChildren(bytes: Uint8Array, node: DerNode): DerNode[] {
  const out: DerNode[] = [];
  const start = node.end - node.content.length;
  let cursor = start;
  while (cursor < node.end) {
    const { node: child, next } = readDerNode(bytes, cursor);
    out.push(child);
    cursor = next;
  }
  return out;
}

/** Extract the raw content of a BIT STRING (drops the unused-bits octet). */
export function derBitStringContent(node: DerNode): Uint8Array {
  if (node.content.length < 1) throw new Error("der: empty BIT STRING");
  return node.content.subarray(1);
}

export const DER_SEQUENCE = 0x30;
export const DER_BIT_STRING = 0x03;
