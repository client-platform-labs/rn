# cert-chain test fixtures (ADR-024)

Static fixtures for `packages/core/test/cert-chain.test.ts`.

## Why these are committed

Before #264 the test generated its RCA and leaf certificates **at run time**
by shelling out to the `openssl` CLI, then parsed the DER. That made the only
test covering the ADR-024 trust chain depend on the byte-level output of
whatever `openssl` happened to be on the machine:

- locally (OpenSSL 3.6.3) the suite was green;
- on the CI runner it failed with `no Ed25519 SPKI in tbs`, which took out
  `pnpm test` and, because the workflow runs steps sequentially, silently
  skipped `check-architecture-governance.mjs`, the verify probes and `rn doctor`.

Committed bytes make the test deterministic: the same DER is parsed everywhere.
The parsing rules of the module under test are unchanged — only the fixture's
provenance is pinned.

## Provenance

Generated with **OpenSSL 3.6.3 (9 Jun 2026)**, validity 36500 days (the verifier
does not read notBefore/notAfter, so this only guards against a future change
that does):

```sh
openssl req -x509 -newkey ed25519 -keyout rca.key -out rca.crt -days 36500 \
  -subj "/CN=ADR024-Test-RCA" -nodes
openssl req -newkey ed25519 -keyout leaf.key -out leaf.csr -nodes \
  -subj "/CN=ADR024-Test-Leaf"
openssl x509 -req -in leaf.csr -CA rca.crt -CAkey rca.key -CAcreateserial \
  -out leaf.crt -days 36500
openssl req -x509 -newkey ed25519 -keyout other.key -out other-rca.crt \
  -days 36500 -subj "/CN=ADR024-Test-OtherRCA" -nodes
```

| File | What it is |
| --- | --- |
| `rca.crt` | root CA certificate (v3, explicit version element) |
| `leaf.crt` | leaf certificate signed by `rca.crt` |
| `other-rca.crt` | an unrelated RCA, for the wrong-RCA fail-closed cases |
| `*-pubkey-hex.txt` | Ed25519 public key of each certificate, lowercase hex |
| `leaf1-signature.txt` | base64 Ed25519 signature over `release-1:js-update:<64 a's>`, made with the leaf key |

### No private key is committed

`leaf1-signature.txt` replaces the leaf private key that the test used to
generate in a temp directory. This repo is a trust-root/OTA platform
(ADR-017/018/024): committing anything shaped like a signing key invites exactly
the ambiguity those ADRs exist to remove, and the test only ever needs one fixed
signature over one fixed payload.

To regenerate the signature:

```sh
node -e 'process.stdout.write("release-1:js-update:"+"a".repeat(64))' > payload.bin
openssl pkeyutl -sign -rawin -inkey leaf.key -in payload.bin | base64
```

## `versionless-leaf.crt` — evidence for an OPEN bug

`leaf.crt` with the explicit `version` element removed from its TBSCertificate
(everything else byte-identical). It is not accepted by any assertion — no test
consumes it yet — because it currently **fails**, and #264 explicitly forbids
suppressing failures.

`packages/core/src/cert-chain.ts` locates the leaf SPKI **by position**, scanning
the TBSCertificate children from a hard-coded index:

```ts
// subjectPublicKeyInfo is the 6th top-level tbs field (after version, serial,
// signature, issuer, validity, subject) — locate by walking.
for (let i = 6; i < tbsChildren.length; i++) {
```

The comment describes a tag-based walk, but the code starts at index 6. That
index is only correct when the certificate carries the explicit version element:

| certificate | tbs children | SPKI index | parser |
| --- | --- | --- | --- |
| `leaf.crt` (v3, version present) | 8 | 6 | found |
| `versionless-leaf.crt` (no version element) | 7 | 5 | `no Ed25519 SPKI in tbs` |

Reproduced locally:

```sh
node -e '
const {readFileSync}=require("fs");
const {verifyX509Ed25519Leaf}=require("./packages/core/dist/cert-chain.js");
const d="packages/core/test/fixtures/cert-chain/";
const pub=readFileSync(d+"leaf-pubkey-hex.txt","utf8").trim();
console.log(verifyX509Ed25519Leaf(readFileSync(d+"versionless-leaf.crt","utf8"),pub,pub));
'
# => { ok: false, reason: 'no Ed25519 SPKI in tbs' }
```

That is the exact CI failure string. `openssl x509 -req` emits a version-less
(v1) certificate when it adds no extensions, and whether it adds them varies by
OpenSSL version and configuration — which is why the same test passed locally and
failed on the runner.

**Consequence:** static fixtures make the gate deterministic, but they do not
make the parser correct. A production RCA or leaf produced by a different
OpenSSL than 3.6.3 can still fail verification on the device. The fix belongs in
`packages/core/src/cert-chain.ts` (locate the SPKI by tag, not by index) and is
outside #264's scope. `pnpm test` must not be made to depend on that fixture
until that fix lands.
