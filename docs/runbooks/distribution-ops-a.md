# 分发服务 运维 A — 一页故障手册（G5）

值守人可用的最短处理路径。每条告警 = 触发条件 → 检查 → 修法。配套脚本：`scripts/distribution-healthcheck.mjs`（触发）+ `scripts/notify-alert.mjs`（通知）。

## 0. 入口

```bash
node scripts/distribution-healthcheck.mjs \
  --base http://127.0.0.1:4040 --project-root /data/project \
  --connector dingtalk --webhook <url>
# cron 建议：每 5 分钟；磁盘阈值 --disk-threshold 85
```

`/health`（存活）≠ `/ready`（存储可读写 + registry 存在，503=未就绪）。

## 1. 服务挂了 / /health 失败

- **检查**：`curl -i <base>/health`；`docker compose ps`；`docker compose logs --tail 100 distribution`。
- **修**：重启容器 `docker compose restart distribution`；起不来看日志（多半是磁盘满或权限）。
- **升级**：3 次重启仍挂 → 走 G4 冷重建（`restore.mjs` + `docker compose up -d --build`）。

## 2. 磁盘满（≥85%）

- **检查**：`df -h /data`；`du -sh /data/project/.rn/delivery/*`（artifacts / registry / logs 谁占）。
- **修**：清制品 GC（旧 digest 按保留策略删）；日志无 max-size → 容器日志轮转/清空；`cp-audit.log` 归档。
- **防**：G4 备份后，把备份移走异地；确认 docker json-file log 配 `max-size`。

## 3. 推了坏包（签名合法但启动崩 / 晋级后崩溃率高）

- **立即**：`POST /v1/kill {business_module, update_ids}` 停包 → 设备回退（shell-core crash-loop 预算）。
- **晋级失败率告警**（healthcheck 已带）→ 暂停 `POST /v1/rollout/pause`，回滚到上一良好 digest。
- **不要**：删 registry 里的行（历史审计）；先 kill/pause 再谈清理。

## 4. 晋级卡住（promote 一直 pending / soak 不过）

- **检查**：`/v1/rollouts`、`/v1/sli` 快照；SLI 缺失 → 设备不上报。
- **修**：确认设备侧 crash-free/采纳率达标；`human_full_approved` 手工放行前查一遍制品与签名（`pem:ed25519` 验签见 verify-* 探针）。

## 5. 证书过期（Caddy/Let's Encrypt）

- **检查**：healthcheck `--cert-file` 告警；`docker compose exec <caddy> caddy list-modules` 或看续期日志。
- **修**：Let's Encrypt 自动续期失败常见原因 = 80 端口/安全组被挡 → 放行；域名解析正确。
- **注意**：Let's Encrypt 有重建速率限制，不要反复删证书目录。

## 6. 验签/信任告警（设备拒绝合法包）

- **检查**：设备侧 `verify REJECTED`；确认签名私钥与设备烘焙公钥匹配（G1/G0）。
- **修**：签名私钥轮换走 ADR-018（双公钥 K1/K2，1 次免重装应急轮换）；别乱动烘焙公钥。
- **升级**：K1、K2 都失陷 = 全量重装（ADR-018）。

## 变更记录

本手册随 `docs/runbooks/` 版本化进 repo；告警项每新增一条配一页处理路径。