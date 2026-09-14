# DR 信任材料恢复 —— 2026-09-14 实测

**P2 修复验证**：ADR-014 冷重建演练从 `TRUST=false`（旧备份只收单个签名私钥）恢复为 **`TRUST=true`**。

## 变更

- `deploy/distribution-service/backup.mjs` — 备份现在捕获**整个信任材料目录** `keys/`（cert 模式 RCA/leaf 私钥与证书、CSR、serial），age 加密进 `secrets.tar.age`（解密私钥仍异地保管）。
- `deploy/distribution-service/restore.mjs` — 恢复 `keys/` 目录。按条目拷贝（macOS `cp -R src/. dest` 会复制目录本身导致 `restored/keys/keys/...`，进而让重建 CP 签发**未签名** CRL —— 演练抓到后改为逐文件拷贝）。
- `deploy/distribution-service/dr-drill.sh` — 终探针断言 `device accepts CRL=true`（恢复前 true → 恢复后 true）；归档探针断言含 RCA/leaf 全组；失败即非零退出。
- `docs/adr/014-dr-cold-rebuild.md` — 承诺文本更新为真实表述（备份含信任材料目录；RCA 私钥 = 设备烘焙信任根，必须进备份）。

## 实测结果（`bash deploy/distribution-service/dr-drill.sh <repo>` → rc=0）

```
1 BEFORE: staging=1 · device accepts CRL=true
2 archive contains the FULL cert-mode trust set (keys/: RCA key+cert, leaf key+cert, csr, serial) — P2
   secrets captured: delivery-sign.pem keys/dr3.csr keys/dr3.key keys/dr3.leaf.crt keys/dr3.rca.crt keys/dr3.rca.key keys/dr3.rca.srl
3 DESTROY EVERYTHING (project + ALL platform key material)  →  only the offsite age identity survives
4 RESTORE from the archive alone
5 DATA recovered ✅ (staging 1=1) · RCA PRIVATE key recovered? 1 file(s)
  AFTER: device accepts CRL=true (before=true)
  TRUST recovered ✅ — a cold rebuild can serve a device-trustworthy CRL again
DRILL PASS
```

## 负向对照（探针确实能失败）

禁用 keys 捕获后重跑演练：

```
FAIL archive is MISSING trust material: dr3.rca.key dr3.rca.crt dr3.key dr3.csr dr3.leaf.crt *.srl
FAIL TRUST NOT recovered ❌ — device rejects the rebuilt CRL (fail-closed blocks updates after DR)
DRILL rc=1
```

即：没有 keys 目录进备份，恢复后的设备验证必然失败 —— 证明两条探针不是摆设。

## 门禁

- `node scripts/check-verification-plane.mjs` → PASS
- `pnpm test` → 473 / 472 pass / 0 fail（本变更未触及 package 代码）
- `bash -n` 各改动 shell 通过
- 无残留 drill 容器；主 checkout 未动
