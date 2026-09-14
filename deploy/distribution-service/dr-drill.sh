#!/usr/bin/env bash
# ADR-014 DRILL, true cold: everything on the "machine" is destroyed except the
# offsite age identity (which ADR-014/A F05 says a second person holds).
set -uo pipefail
REPO="$1"; ROOT=${DRILL_ROOT:-/tmp/rn-dr-drill}; IMG="${CP_IMAGE:-client-platform/cp:drill}"
export DRILL_REPO="$REPO"
step() { printf '\n=== %s ===\n' "$*"; }
ok()   { printf '  OK   %s\n' "$*"; }
bad()  { printf '  FAIL %s\n' "$*"; FAILS=$((FAILS+1)); }
FAILS=0
# device-trustworthy CRL check — ESM verifier against the device-baked RCA pubkey
crl_accepts() { # crl-json-file rca-hex -> true|false
  node --input-type=module -e '
    const { verifyRevocationSealAny } = await import(process.env.DRILL_REPO + "/packages/shell-core/dist/index.js");
    const fs = await import("node:fs");
    const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (typeof j.seal === "string" && typeof j.payload === "string") {
      console.log(verifyRevocationSealAny(j.seal, j.payload, [process.argv[2]]));
    } else {
      console.log("false");
    }
  ' "$1" "$2"
}
rm -rf "$ROOT"; mkdir -p "$ROOT"/{project/.rn/delivery/artifacts,keys,offsite}
docker rm -f cp-drill-t1 cp-drill-t2 >/dev/null 2>&1

step "0 seed project + lab cert-chain keypair; keep ONLY the public RCA hex offsite"
printf '{\n  "name": "dr3", "version": "0.0.0", "private": true\n}\n' > "$ROOT/project/package.json"
( cd "$REPO" && node packages/ship/bin/ship.mjs keygen --dir "$ROOT/keys" --label dr3 >/dev/null 2>&1 )
RCA_HEX=$(openssl x509 -in "$ROOT/keys/dr3.rca.crt" -noout -pubkey | openssl pkey -pubin -outform DER | tail -c 32 | xxd -p -c 64)
echo "$RCA_HEX" > "$ROOT/offsite/device-baked-rca-pubkey.txt"
node -e '
const fs=require("fs"),crypto=require("crypto");const d=process.argv[1]+"/project/.rn/delivery";
const blob=Buffer.from("PAYLOAD-".repeat(200));
const digest=crypto.createHash("sha256").update(blob).digest("hex");
fs.writeFileSync(`${d}/artifacts/${digest}`,blob);
fs.writeFileSync(`${d}/registry.json`,JSON.stringify({schemaVersion:1,staging:[{schemaVersion:1,release_id:"dr3",artifact_kind:"js-update",platform:"js",profile:"release",digest,stage:"release",artifact_line:"dr3",business_module:"main",update_id:`main-${digest.slice(0,12)}`,configuration:"release",path:`${d}/artifacts/${digest}`}],production:[],blocked:[],revocations:[{public_key_hex:"e5f6757ec8c38baf9b6ee21d36ede5992d711fe8473f27d14f02471f9c5dc173",reason:"dr3"}]},null,2)+"\n");' "$ROOT"
ok "RCA that devices bake: ${RCA_HEX:0:16}..."

step "1 BEFORE: container serves the seeded state with a device-trustworthy CRL"
docker run -d --name cp-drill-t1 -p 17450:7430 -v "$ROOT/project:/cp/project" -v "$ROOT/keys:/keys:ro" \
  -e RN_CP_PROJECT=/cp/project -e RN_CP_REGISTRY=file -e RN_DELIVERY_SIGN_KEY_FILE=/keys/dr3.rca.key "$IMG" >/dev/null
for i in $(seq 1 25); do curl -sf --max-time 2 http://127.0.0.1:17450/health >/dev/null 2>&1 && break; sleep 1; done
B_REG=$(curl -s http://127.0.0.1:17450/v1/registry | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).staging.length))')
curl -s http://127.0.0.1:17450/v1/crl > "$ROOT/before-crl.json"
B_TRUST=$(crl_accepts "$ROOT/before-crl.json" "$RCA_HEX")
ok "BEFORE: staging=$B_REG · device accepts CRL=$B_TRUST"

step "2 BACKUP (as documented: RN_DELIVERY_SIGN_KEY_FILE = the release signing key)"
age-keygen -o "$ROOT/offsite/age.key" >/dev/null 2>&1
RECIP=$(grep -o 'age1[a-z0-9]*' "$ROOT/offsite/age.key" | head -1)
( cd "$REPO" && RN_CP_REGISTRY=file RN_DELIVERY_SIGN_KEY_FILE="$ROOT/keys/dr3.key" \
  node deploy/distribution-service/backup.mjs "$ROOT/project" --backup-dir "$ROOT/backups" --age-recipient "$RECIP" >/dev/null 2>&1 )
B=$(find "$ROOT/backups" -maxdepth 1 -type d -name "dist-*" | sort | tail -1)
mkdir -p "$ROOT/peek" && age -d -i "$ROOT/offsite/age.key" -o "$ROOT/peek/s.tar" "$B/secrets.tar.age" 2>/dev/null
echo "  archive items: $(node -e 'console.log(Object.keys(require(process.argv[1]+"/manifest.json").items).join(", "))' "$B")"
echo "  secrets captured: $(tar -tf "$ROOT/peek/s.tar" 2>/dev/null | tr '\n' ' ')"
echo "  keys that existed: $(find "$ROOT/keys" -maxdepth 1 -type f -exec basename {} \; | sort | tr '\n' ' ')"
KEYS_MISSING=""
for f in dr3.rca.key dr3.rca.crt dr3.key dr3.csr dr3.leaf.crt; do
  tar -tf "$ROOT/peek/s.tar" 2>/dev/null | grep -q "^keys/$f$" || KEYS_MISSING="$KEYS_MISSING $f"
done
tar -tf "$ROOT/peek/s.tar" 2>/dev/null | grep -q '^keys/.*\.srl$' || KEYS_MISSING="$KEYS_MISSING *.srl"
if [[ -z "$KEYS_MISSING" ]]; then
  ok "archive contains the FULL cert-mode trust set (keys/: RCA key+cert, leaf key+cert, csr, serial) — P2"
else
  bad "archive is MISSING trust material:$KEYS_MISSING"
fi

step "3 DESTROY EVERYTHING (true machine loss: project + ALL platform key material)"
docker rm -f cp-drill-t1 >/dev/null 2>&1
rm -rf "$ROOT/project" "$ROOT/keys"
ok "project gone: $([ -d "$ROOT/project" ] && echo NO || echo yes) · keys dir gone: $([ -d "$ROOT/keys" ] && echo NO || echo yes)"
ok "only the offsite age identity survives (as ADR-014 intends)"

step "4 RESTORE from the archive alone"
( cd "$REPO" && node deploy/distribution-service/restore.mjs "$B" "$ROOT/restored" --age-identity "$ROOT/offsite/age.key" >/dev/null 2>&1 )
printf '{\n  "name": "dr3", "version": "0.0.0", "private": true\n}\n' > "$ROOT/restored/package.json"
ok "restored: $(find "$ROOT/restored/.rn/delivery" -maxdepth 1 -exec basename {} \; | sort | tr '\n' ' ')"
echo "  signing key recovered: $(find "$ROOT/restored" -maxdepth 1 -name "*.pem" -exec basename {} \; | sort | tr '\n' ' ')"

step "5 PROVE: can the rebuilt deployment still serve a device-trustworthy CRL?"
# P2: sign the CRL with the RECOVERED RCA key — the key the device baked — so
# the rebuilt deployment serves a device-trustworthy CRL again.
RECOVERED_RCA=$(find "$ROOT/restored/keys" -name "*.rca.key" 2>/dev/null | head -1)
RECOVERED_KEYS="$ROOT/restored/keys"
docker run -d --name cp-drill-t2 -p 17451:7430 -v "$ROOT/restored:/cp/project" \
  -v "$RECOVERED_KEYS:/keys:ro" \
  -e RN_CP_PROJECT=/cp/project -e RN_CP_REGISTRY=file \
  ${RECOVERED_RCA:+-e RN_DELIVERY_SIGN_KEY_FILE=/keys/$(basename "$RECOVERED_RCA")} "$IMG" >/dev/null
for i in $(seq 1 25); do curl -sf --max-time 2 http://127.0.0.1:17451/health >/dev/null 2>&1 && break; sleep 1; done
A_REG=$(curl -s http://127.0.0.1:17451/v1/registry | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).staging.length))' 2>/dev/null)
curl -s http://127.0.0.1:17451/v1/crl > "$ROOT/after-crl.json" 2>/dev/null
ok "restored staging=$A_REG (before=$B_REG)"
[ "$A_REG" = "$B_REG" ] && ok "DATA recovered ✅" || bad "data loss: $B_REG -> $A_REG"
echo "  RCA PRIVATE key recovered? $(find "$ROOT/restored/keys" -name '*.rca.key' 2>/dev/null | wc -l | tr -d ' ') file(s)"
A_TRUST=$(crl_accepts "$ROOT/after-crl.json" "$RCA_HEX" 2>/dev/null || echo "false")
ok "AFTER: device accepts CRL=$A_TRUST (before=$B_TRUST)"
if [[ "$A_TRUST" == "true" ]]; then
  ok "TRUST recovered ✅ — a cold rebuild can serve a device-trustworthy CRL again"
else
  bad "TRUST NOT recovered ❌ — device rejects the rebuilt CRL (fail-closed blocks updates after DR)"
fi
docker rm -f cp-drill-t2 >/dev/null 2>&1
echo "  archive kept: $B"
echo
[[ $FAILS -eq 0 ]] && ok "DRILL PASS" || { bad "DRILL FAIL ($FAILS failure(s))"; exit 1; }
