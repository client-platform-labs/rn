# 架构者自测手册 — 把平台当黑盒测一遍

> 目标：让任何架构者 / SRE / 业务方，**不读代码**，按本手册复制命令、点回车，1 小时内把平台的"运行时真实状态"看透。
> 适用：你在新设备 / 新机器 / 新公司，想知道这套平台到底能不能跑通，要建一个壳/包/灰度时心里有底。

---

## 0. 你需要准备什么

| 类别 | 必须 | 备注 |
|------|------|------|
| 机器 | macOS / Linux | 已测过 macOS（arm64, M-series） |
| 工具 | `git node>=22 pnpm adb gh jq caddy` (可选) docker (可选) | 见 §1 验真 |
| 设备 | 一台 Android 真机（已 root 或 adb 可写）| 已测 V2425A (Android 16) |
| 网络 | 局域网通 WiFi，adb reverse 6 端口 | 已测 8081/8082/8087/8088/8090/7420 |
| 代码仓 | `client-platform-labs/rn` + 业务壳 + 业务模块 1-2 个 | `~/code/tiangong-host` `~/code/desk` `~/code/fixture_second` |
| 后端 | Python 3.11+（Nous） | `~/code/nous` `.venv` 已建 |

---

## 1. 一键前置验真 (1 min)

复制整段跑，看输出**全 ✓ 才继续**：

```bash
# 1.1 仓与工具
cd ~/Work/client-platform-labs/rn
[ -d .git ] && echo "✓ git 仓"
which rn rn-delivery node pnpm adb gh jq git 2>&1 | sed 's/^/  /'
java -version 2>&1 | head -1 | sed 's/^/  /'
echo "ANDROID_HOME=$ANDROID_HOME"

# 1.2 adb 设备
adb devices | sed 's/^/  /'

# 1.3 业务仓
for p in ~/code/tiangong-host ~/code/desk ~/code/fixture_second; do
  [ -d "$p" ] && echo "✓ $p" || echo "✗ 缺: $p"
done

# 1.4 Python + Nous
[ -f ~/code/nous/.venv/bin/nous ] && echo "✓ nous venv" || echo "✗ 缺 nous venv"

# 1.5 后台三件套
for url in "http://127.0.0.1:4040/health" "http://127.0.0.1:8000/v1/health"; do
  r=$(curl -sf -m 3 "$url" 2>/dev/null)
  [ -n "$r" ] && echo "✓ $url → $r" || echo "○ $url 未起 (后启动)"
done
```

**如果任何 ✗** → 见 §8 故障排除

---

## 2. 启动后台三件套 (3 min)

> 顺序：**CP+Caddy → Nous**。CP 是平台核心，Nous 是业务。

```bash
# 2.1 平台 CP + Caddy (一键)
bash ~/Work/client-platform-labs/rn/scripts/setup-local-distribution-server.sh
# 看到 "=== 就绪 ===" + 列出 :4040 + :80 即可

# 2.2 Nous (Python venv)
cd ~/code/nous
./.venv/bin/nous serve </dev/null >>/tmp/nous.log 2>&1 & disown
sleep 4
curl -sf http://127.0.0.1:8000/v1/health | jq .

# 2.3 验 CP 真活
curl -s http://127.0.0.1:4040/v1/service | jq '{name, mode, storage}'
```

**期望**：
- CP `/v1/service` 报 `name: "control-plane", mode: "cp-serve", storage: "file"`
- Nous `/v1/health` 报 `{"status":"ok","db":"connected"}`
- Caddy 在 :80，绑 dist.tiangong.local / dist-staging.tiangong.local

**如果 CP 起不来** → 看 §8.1（macOS `nohup` + `disown` 不稳问题）。

---

## 3. 跑 E2E 套件 (1 min)

```bash
cd ~/Work/client-platform-labs/rn
bash scripts/e2e/run-all.sh
```

**期望**：
- `全部 chain PASS`（绿色）
- 9 个 chain 全跑过（`0 FAIL`）
- 报告在 `/tmp/e2e-out/report-YYYYMMDD-HHMMSS.md`

> `run-all.sh` 现在会自动跑 `seed-registry.sh`（幂等灌壳 + 离线包到 staging），
> 无需手动预灌数据。seed 只写 staging lane，不碰 production。

**如果 FAIL** → 看 `/tmp/e2e-out/chain-XX-name.log` 末尾 ✗ 行
**如果 SKIP** → 看 §6 "已知 SKIP/WARN 清单"

---

## 4. 手动端到端：装壳 + 跑业务 (10 min)

> 模拟"业务方第一次接入"全流程。

### 4.1 装壳

```bash
# 拉 host APK
DIGEST=$(curl -s -H "Authorization: Bearer dev" \
  "http://127.0.0.1:4040/v1/candidates?lane=staging" | jq -r '.candidates[0].digest')
echo "digest=$DIGEST"
curl -sf -o /tmp/host.apk "http://127.0.0.1:4040/v1/artifacts/$DIGEST"
ls -la /tmp/host.apk

# push + pm install（不用 streamed install — vivo Android 16 上卡死）
adb -s $(adb devices | awk 'NR==2{print $1}') push /tmp/host.apk /data/local/tmp/host.apk
adb -s $(adb devices | awk 'NR==2{print $1}') shell pm install -r -t /data/local/tmp/host.apk

# 启 + 验前台
adb shell am start -n com.hermesgfapp/.MainActivity
sleep 3
adb shell dumpsys activity activities | grep topResumedActivity
```

**期望**：`topResumedActivity=ActivityRecord{... com.hermesgfapp/.MainActivity ...}`

### 4.2 模拟业务发版 (JS update)

```bash
# 业务仓打 bundle
cd ~/code/tiangong-host
RN_CP_TOKEN=dev node packages/rn-delivery/bin/rn-delivery.mjs build pack --module desk --out-dir .rn/ota-build/desk

# ingest → sign → release
node packages/rn-delivery/bin/rn-delivery.mjs ingest-pack --module desk --bundle .rn/ota-build/desk/index.bundle
# (返回 digest)

# 拿到 digest 后
DIG=<上面输出的64位hex>
node packages/rn-delivery/bin/rn-delivery.mjs sign --digest $DIG --kind js-update
node packages/rn-delivery/bin/rn-delivery.mjs release --digest $DIG --kind js-update --lane staging

# 验
curl -s -H "Authorization: Bearer dev" "http://127.0.0.1:4040/v1/js-updates?module=desk&lane=staging" | jq '.candidates[0] | {digest, stage, signature}'
```

**期望**：
- registry 新增 1 条 js-update
- stage = "promote"
- 有 signature 字段（无 `RN_DELIVERY_SIGN_KEY` 时为 **digest-seal 占位**；设置了 key 则 HMAC-sha256。真 CA 签名见 #90 backlog）

### 4.3 灰度 (staging → production)

```bash
DIG=$(curl -s -H "Authorization: Bearer dev" "http://127.0.0.1:4040/v1/js-updates?module=desk&lane=staging" | jq -r '.candidates[0].digest')
cd ~/code/tiangong-host
node packages/rn-delivery/bin/rn-delivery.mjs promote --digest $DIG --kind js-update --from staging --to production

# 验
curl -s -H "Authorization: Bearer dev" "http://127.0.0.1:4040/v1/js-updates?module=desk&lane=production" | jq '.candidates | length'
```

**期望**：`length >= 1`

### 4.4 Kill Switch (紧急回滚)

```bash
# 模拟 SLO 违例
curl -X POST -H "Authorization: Bearer dev" -H "Content-Type: application/json" \
  -d '{"reason":"e2e-probe","digest":"x"}' \
  http://127.0.0.1:4040/v1/rollout/slo-breach

# 查 kill registry
jq '.kills' ~/code/tiangong-host/.rn/delivery/registry.json
```

**期望**：`kills` 数组里有新条目（如果 endpoint 接收了）

---

## 5. 角色扮演：模拟不同身份

> 每个角色关注点不同，下表给你"按角色看什么"。

| 角色 | 想看什么 | 跑哪条 | 关键命令 |
|------|---------|--------|---------|
| **平台架构师** | 全栈是否能跑通 | chain 1-9 全部 | `bash scripts/e2e/run-all.sh` |
| **业务模块开发** | 我的 desk 模块能不能跑 | chain 02/05/07 | `bash scripts/e2e/run-all.sh 2 5 7` |
| **壳工程** | host APK 能不能装 | chain 03/04/06 | `bash scripts/e2e/run-all.sh 3 4 6` |
| **SRE / 运维** | 灰度 / rollback 通不通 | chain 08/09 | `bash scripts/e2e/run-all.sh 8 9` |
| **iOS 工程师** | (今日不在范围 — 见 §7) | n/a | n/a |
| **7 渠道运营** | Android 多市场发版前 | `scripts/release-readiness/09-7channel.sh` | (pre-flight only) |

---

## 6. 已知 SKIP / WARN 清单 (2026-09-05)

这些**不是真问题**，是平台薄弱的真实位置。跑测时遇到不要慌。按根因归 5 类：

### 6.1 签名 / SBOM（✅ 已修 · 根因是 chain-06 漏了 sign 阶段）

`sign` 阶段本身已实现（`RN_DELIVERY_SIGN_KEY` 可切 HMAC，无 key 时 digest-seal 占位）。**真根因**是 `chain-06` 发壳流程只做了 `ingest-host → release`，漏掉了七阶段合同里 `sign` 这一步，导致 host candidate 进 registry 时没有 `signature` 和 `supply_chain.host.sbom` slot，进而 chain 03/08 判「缺签名/SBOM」。

**已修**：`chain-06` 在 `ingest-host` 后补 `rn-delivery sign`。签名/SBOM slot 就位后，Chain 03/08 这两条 WARN 自动消除。真 CA / 真 CycloneDX 仍是企业侧 backlog（#90），但「release 壳校验链形同虚设」这句不再成立——sign 阶段已在链上真跑。
   210|**说明**：`rn-delivery` 的 signature 是无 key 时的 digest-seal（不是工业 CA 签名），这是有意设计的薄实现（`Map C C7` 的替换点）。链上现在确实执行了 sign 阶段。

### 6.2 CP Auth（✅ 已修 · 根因是测试测错了对象）

CP Auth **早已实现且 `verify-cp-auth.mjs` PASS**（CI 在跑）。它只保护**写路由**（POST promote/block/kill/pause/rollout、PUT dependency-manifest）；而 `GET /v1/candidates`、`/health`、`/v1/service` 是**设计上的公开读路由**。

**真根因**：`chain-06` 6.8-6.9 和 `chain-09` 9.2-9.3 之前拿 `GET /v1/candidates` 去断言「无 token 应 401」，这是**测错了端点**——公开读路由本来就应该 200。

**已修**：改成对 `POST /v1/promote`（受保护的写路由）断言「无 token / 错 token → 401，正确 token → 400（鉴权通过但 digest 不存在）」。9.4 从「正确 token → 200」更正为「正确 token → 400」。
   220|**说明**：企业多租户隔离仍缺（token 是单值 `RN_CP_TOKEN`，非 per-tenant），那是真 backlog，但「Auth 未启用」不再是事实。

### 6.3 灰度 / 运维引擎未开通（顿在蓝图/钢线）

| Chain | Step | 现象 | 根因 |
|-------|------|------|------|
| 04 | 4.8 | `rollout/tick` rc=404 | rollout 引擎没起 |
| 08 | 8.2 | 无 gray lane | thin CP 只 staging/production 两档 |
| 08 | 8.3 | 无 device-manifest | 设备切片/灰度按 lane 兜底 |
| 08 | 8.4-8.5 | PUT lane rc=404 | 切 lane 端点未实现 |

**影响**：灰度放量、设备分组、AB 实验这些「工业级」能力目前只有 registry 结构占位（`pauses/kills/rollouts` 键都在），端点还没实接。

### 6.4 日志 / 门禁路径未触发（可观测性 gap）

| Chain | Step | 现象 |
|-------|------|------|
| 06 | 6.10 | cp-serve.log 未含 sign/release/ingest 七阶段日志 |

**影响**：上线门禁想靠日志断言「七阶段都走过」，但当前 CP 不把这些事件写到统一 log，门禁只能靠 registry 状态推断，不是真 log 审计。

### 6.5 业务 / 数据侧未初始化（无害）

| Chain | Step | 现象 |
|-------|------|------|
| 02 | 2.6 | 缺 `ota-business-pack/fixture_second` 路径 bundle（实际落在 `ota-build/`） |
| 02 | 2.7 | loadPolicy 输出乱码（jsonc BOM） |
| 09 | 9.11 | Nous `global/latest` 空（业务数据未灌） |

**影响**：2.6 是 bundle 输出目录命名不一致（`ota-business-pack` vs `ota-build`），2.7 是 BOM，9.11 是 Nous 侧没跑 init 脚本——三者都不阻塞主链路。

---

### 真问题 0 个

全跑 **9 chain 全 PASS · 0 FAIL · 48s · 0 人工干预**。上面所有 SKIP/WARN 都有明确归属（灰度/运维端点、日志门禁、业务/数据侧未初始化），不是回归缺陷。

**按优先级待修**：6.3 灰度/运维端点（rollout/tick 404、device-manifest、gray lane）> 6.4 日志门禁 > 6.5 数据/文档细节。签名/SBOM 和 CP Auth 已核实是测试脚本 bug（已修），不再是产品缺口。

---

## 7. iOS / Harmony / 7 渠道 (今日不在范围)

按你今天要求，**iOS 没跑**（需 macOS + Xcode + 模拟器/真机）。如下次扩展：

- **iOS**：装 Xcode → 同套步骤（chain 改 adb → xcrun simctl）· 工作量 +50%
- **Harmony**：shelved（缺真机 + DevEco Studio）
- **7 渠道（华为/小米/OPPO/vivo/...）**：上市前在 `scripts/release-readiness/09-7channel.sh` 验

---

## 8. 故障排除

### 8.1 CP 起不来 (macOS `nohup` 死锁)

**症状**：
```
listen EADDRINUSE: address already in use 0.0.0.0:4040
```
然后 CP 静默退出。

**原因**：`nohup` + `disown` 在 macOS 上不能完全脱离父进程 session。

**修法**：
```bash
pkill -9 -f rn-delivery
pkill -9 -f caddy
lsof -tiTCP:4040 -sTCP:LISTEN 2>/dev/null | xargs -r kill -9
lsof -tiTCP:80 -sTCP:LISTEN 2>/dev/null | xargs -r kill -9
# 再用 cp-spawn.mjs 启（已集成在 run-all.sh 内的逻辑）
node -e '
import("node:child_process").then(({spawn}) => {
  const out = require("fs").openSync("/tmp/cp.log","a");
  const c = spawn("node",["/Users/xuwei/Work/client-platform-labs/rn/packages/rn-delivery/bin/rn-delivery.mjs","cp-serve","--port","4040","--host","0.0.0.0"],{cwd:"/Users/xuwei/code/tiangong-host",detached:true,stdio:["ignore",out,out]});
  c.unref();
  console.log("cp pid="+c.pid);
});
'
```

### 8.2 `adb install` hang (vivo Android 16)

**症状**：`adb install` 30s+ 不返回。

**原因**：vivo Android 16 上的 streamed install bug。

**修法**：永远用 `push + pm install`：
```bash
adb push foo.apk /data/local/tmp/foo.apk
adb shell pm install -r -t /data/local/tmp/foo.apk
```

### 8.3 `adb logcat -d` hang

**症状**：chain 3.8 卡 60s+。

**修法**：用 `with-timeout.mjs` 包装：
```bash
node scripts/e2e/with-timeout.mjs adb logcat -d -t 200 --ms=15000
```

### 8.4 `jq` 不读 .jsonc

**症状**：`jq: parse error: Invalid numeric literal at line 1, column 3`

**原因**：`//` 注释让 jq 解析失败。

**修法**：用 `node scripts/e2e/jget.mjs <file> <path>`（已带注释剥离）。

### 8.5 E2E 跑不过但 logcat 看不到

**原因**：ANSI 颜色码被 grep 吞了。

**修法**：
```bash
sed 's/\x1b\[[0-9;]*m//g' /tmp/e2e-out/chain-XX.log | grep -E "✗|✓|!"
```

---

## 9. 看完一遍需要多久

| 阶段 | 时间 | 你需要做什么 |
|------|------|--------------|
| §1 前置验真 | 1 min | 复制粘贴 |
| §2 启后台 | 3 min | 复制粘贴 + 看 "就绪" |
| §3 E2E 套件 | 1 min | 复制粘贴 + 等 1 分钟 |
| §4 手动端到端 | 10 min | 复制粘贴 + 装包 |
| §5 角色扮演 | 5 min | 按需选 chain |
| **总计** | **~20 min** | 一遍过 |

**带 6 渠道/7 渠道/Harmony** 的扩展版 = 1-2 小时。
**带 iOS** = +1 小时。
**带发布平台（控制台）真用** = +1-2 小时。

---

## 10. 下一步可做的事

- [x] **签名/SBOM 链上执行**：`chain-06` 补 sign 阶段，Chain 03/08 WARN 消除（真 CA/CycloneDX 仍是 #90 企业 backlog）— §6.1
- [x] **CP-Auth 更正测试**：chain 6/9 改为测受保护写路由，Auth 已验证在跑（企业 per-tenant 隔离是真 backlog）— §6.2
- [ ] **灰度/运维引擎开通**: rollout/tick + gray lane + device-manifest (Chain 04/08 抹掉 WARN) — §6.3
- [ ] **日志门禁**: CP 七阶段事件写统一 log，`chain-06 6.10` 转真审计 — §6.4
- [ ] **数据/文档细节**: bundle 输出目录统一 + jsonc BOM + Nous init — §6.5
- [ ] **iOS 链**: 装 Xcode + xcrun simctl 适配
- [ ] **CI 集成**: 无设备 release-readiness 阶梯进 GitHub Actions；真机门禁走自托管 runner + 设备农场
- [ ] **Atlas 同步**: 在 `wayfinding-map-f/ATLAS.md §4` 链接到本手册

---

## 附录 · 一键全套

复制这段一次性跑完 §1-§4：

```bash
# §1 前置
bash -c '
cd ~/Work/client-platform-labs/rn
[ -d .git ] && echo "✓ git"
which rn rn-delivery node pnpm adb gh jq
adb devices
' 2>&1 | head -20

# §2 启后台
bash ~/Work/client-platform-labs/rn/scripts/setup-local-distribution-server.sh 2>&1 | tail -10
(cd ~/code/nous && ./.venv/bin/nous serve </dev/null >>/tmp/nous.log 2>&1 &)
sleep 4
curl -sf http://127.0.0.1:8000/v1/health

# §3 E2E
cd ~/Work/client-platform-labs/rn
bash scripts/e2e/run-all.sh

# §4 装壳
DIGEST=$(curl -s -H "Authorization: Bearer dev" "http://127.0.0.1:4040/v1/candidates?lane=staging" | jq -r '.candidates[0].digest')
curl -sf -o /tmp/host.apk "http://127.0.0.1:4040/v1/artifacts/$DIGEST"
DEV=$(adb devices | awk 'NR==2{print $1}')
adb -s $DEV push /tmp/host.apk /data/local/tmp/host.apk
adb -s $DEV shell pm install -r -t /data/local/tmp/host.apk
adb -s $DEV shell am start -n com.hermesgfapp/.MainActivity
sleep 3
adb -s $DEV shell dumpsys activity activities | grep topResumedActivity
```

**期望**：
- §1 全 ✓
- §2 看到 "就绪" + `{"status":"ok","db":"connected"}`
- §3 "全部 chain PASS"
- §4 `topResumedActivity=...com.hermesgfapp/.MainActivity...`

> 任何一步 ✗ → 回到对应章节排查。
