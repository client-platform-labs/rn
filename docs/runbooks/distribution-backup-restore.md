# 分发服务备份 / 恢复 / 一键重建 Runbook（G4，ADR-014）

面向真人员操作员。契约：**DR = 冷重建**（非「温备」）。RPO ≈ 每日备份；RTO ≈ 分钟级手动重建（任意装 Docker 的机器，含本地 Mac）。

## 必备份项（不可再生 vs 可再生）

| 数据 | 是否必须 | 说明 |
|---|---|---|
| registry（`.rn/delivery/registry.sqlite` 或 `registry.json`） | **必须** | 控制面唯一事实源 |
| 制品目录（`.rn/delivery/artifacts/`） | 建议 | 可重打，但备份免重跑 release |
| 签名私钥（`RN_DELIVERY_SIGN_KEY_FILE`） | **必须** | 不可再生；泄露/丢失 = 全量重装（ADR-018） |
| 部署 `.env`（token/数据库等） | **必须** | 不可再生 |
| TLS 证书（Caddy volume） | 建议 | 别名/续期后补 |

## 密钥保管（age）

- age **公钥**滚进脚本/仓库（加密用），可公开无害。
- age **私钥**由人**异地保管**，不进 git、不上生产机。解密只在恢复时用。
- 私钥同样不可再生；建议至少两份离线副本（不同介质）。

## 每日备份

```bash
# 在 ECS 数据卷所在目录（PROJECT_ROOT）执行；cron 每日一次
AGE_RECIPIENT=age1xxxx \          # age 公钥
RN_DELIVERY_SIGN_KEY_FILE=/run/secrets/delivery-sign.pem \
ENV_FILE=deploy/distribution-service/.env \
node deploy/distribution-service/backup.mjs /data/project \
  --backup-dir /backups
```

产出 `backups/dist-<ts>/`：`manifest.json`（含每项 sha256）+ `registry.sqlite` + `artifacts.tar` + `secrets.tar.age`。

**然后把备份目录离线转存**（远端对象存储/另一台机器）。备份留原地 = 未异地，不满足 DR。

## 恢复 / 一键重建（迁云、换机、DR）

```bash
# 1. 新机装 Docker + Node ≥22（age/tar 已在 PATH 即可）
# 2. 取回备份目录 + age 私钥
# 3. 恢复
node deploy/distribution-service/restore.mjs \
  /backups/dist-<ts> /data/project \
  --age-identity /secure/age-key.txt

# 4. 起服务
docker compose -f deploy/distribution-service/docker-compose.yml up -d --build

# 5. 健康检查
curl http://127.0.0.1:4040/health
curl http://127.0.0.1:4040/v1/service    # 确认 storage=sqlite、无 postgres:true
```

恢复脚本会校验 `manifest.json` 的 sha256 后再落盘，避免坏归档污染新机。

## 恢复演练（至少一次，留证据 `docs/hitl/`）

1. 用最近一份真实备份，在**另一台机器或本机临时目录**跑上面恢复流程。
2. 验证 registry 可读、制品可下载、签名私钥可用（能对同一 digest 重新 `pem:ed25519` 签名）。
3. 记录演练时间 + 结果到 `docs/hitl/`（作为 RTO 证据）。

## 边界（本图不承诺）

真 HA（双实例 + 托管 RDS/OSS）、秒级切换、托管 KMS/HSM 密钥——升级接缝在 #201（G9）。备份不覆盖这些未来组件。