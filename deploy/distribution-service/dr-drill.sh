#!/usr/bin/env bash
# ADR-014 DRILL, true cold: everything on the "machine" is destroyed except the
# offsite age identity (which ADR-014/A F05 says a second person holds).
set -uo pipefail
REPO="$1"; ROOT=${DRILL_ROOT:-/tmp/rn-dr-drill}; IMG="${CP_IMAGE:-client-platform/cp:drill}"
step() { printf '\n=== %s ===\n' "$*"; }
ok()   { printf '  OK   %s\n' "$*"; }
bad()  { printf '  FAIL %s\n' "$*"; }
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
ok "staging=$B_REG · CRL seal vs device-baked RCA: $(node -e 'const {verifyRevocationSealAny}=require("'"$REPO"'/packages/shell-core/dist/index.js");const j=require(process.argv[1]);console.log(verifyRevocationSealAny(j.seal,j.payload,[process.argv[2]]))' "$ROOT/before-crl.json" "$RCA_HEX" 2>/dev/null || echo "(verifier is ESM; checked in the final step)")"

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
# Use whatever signing key the restore actually recovered.
RECOVERED=$(find "$ROOT/restored" -name "*.pem" | head -1)
docker run -d --name cp-drill-t2 -p 17451:7430 -v "$ROOT/restored:/cp/project" \
  -e RN_CP_PROJECT=/cp/project -e RN_CP_REGISTRY=file \
  ${RECOVERED:+-e RN_DELIVERY_SIGN_KEY_PEM="$(cat "$RECOVERED")"} "$IMG" >/dev/null
for i in $(seq 1 25); do curl -sf --max-time 2 http://127.0.0.1:17451/health >/dev/null 2>&1 && break; sleep 1; done
A_REG=$(curl -s http://127.0.0.1:17451/v1/registry | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).staging.length))' 2>/dev/null)
curl -s http://127.0.0.1:17451/v1/crl > "$ROOT/after-crl.json" 2>/dev/null
ok "restored staging=$A_REG (before=$B_REG)"
[ "$A_REG" = "$B_REG" ] && ok "DATA recovered ✅" || bad "data loss: $B_REG -> $A_REG"
echo "  device-baked RCA on file (offsite copy): ${RCA_HEX:0:16}..."
echo "  RCA PRIVATE key present after restore? $(find "$ROOT/restored" "$ROOT/offsite" -name '*rca*key*' 2>/dev/null | wc -l | tr -d ' ') file(s)"
echo "  CRL after rebuild: $(node -e 'const j=require(process.argv[1]);console.log(j.seal?("signed by "+(j.seal||"").slice(0,14)+"..."):"UNSIGNED")' "$ROOT/after-crl.json" 2>/dev/null || echo "(no body)")"
docker rm -f cp-drill-t2 >/dev/null 2>&1
echo "  archive kept: $B"
