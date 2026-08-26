# AFK / HITL 操作指南

**一页纸：** 日常回归、真机门禁、交付钢线怎么跑。  
**理论清单：** [afk-hitl-loop.md](../agents/afk-hitl-loop.md)  
**推广口径：** GF **L5** · BF **L5**

默认项目：`~/Work/my-rn-app`（可换成你的宿主仓）。平台仓：`~/Work/client-platform-labs/rn`。

---

## 0. 本机前置（做一次）

```bash
# Node：必须 22–24（推荐 24）；26 会被 doctor / loop 拒绝或自动 re-exec
nvm use 24   # 或确保 PATH 上是 node@24，不要让 brew node@26 抢前

# Android
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb devices   # 必须出现 xxxx	device（不是 unauthorized）

# 平台仓
cd ~/Work/client-platform-labs/rn
pnpm install && pnpm build
```

---

## 1. 日常：一条命令回归（推荐）

在**平台仓**执行：

```bash
cd ~/Work/client-platform-labs/rn

# 只看依赖图，不跑
node scripts/run-afk-hitl-loop.mjs --plan

# 全量：AFK + 有手机则 AUTO-HITL（含真装 APK、BF L5）
node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app

# 无手机 / CI
node scripts/run-afk-hitl-loop.mjs --mode afk
```

**成功标准：** 末尾 `AFK/HITL loop: PASS`；报告在：

- `docs/hitl/afk-hitl-loop-latest.json`
- `docs/hitl/afk-hitl-loop-latest.md`

**对 Agent：** 说「自动跑 / 继续」即跑本命令，不逐步确认。

---

## 2. 日常开发（业务 / 壳）

在**应用仓** `~/Work/my-rn-app`：

```bash
# 体检（BF 宿主加 --profile brownfield）
rn doctor
rn doctor --profile brownfield

# 多 Metro 开发（main :8081 · support :8082）
rn dev --modules main,support

# 另开终端：装 debug-host / 桥接
rn-delivery build --platform android --profile debug-host
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8082 tcp:8082
```

BF 壳：手机打开 **Brownfield native shell** → 点 main(8081) / support(8082)。

Release 前清掉 Dev Support：

```bash
rn dev-support remove
```

---

## 3. 交付钢线（GF = BF 同一管道）

在**应用仓**，已有 `modules/main` 时：

```bash
# 宿主 release 候选
rn-delivery build --platform android --profile release
rn-delivery validate
rn-delivery release --install          # → staging；可选装真机

# 单 module js-update
rn-delivery update --module main --profile release
rn-delivery sign                       # 可选：RN_DELIVERY_SIGN_KEY=… 走 HMAC
rn-delivery validate
rn-delivery release
rn-delivery promote                    # → production

# 质量挡板（L5）
rn-delivery signal record --module main --update-id <update_id> --kind crash
rn-delivery promote                    # 应失败
rn-delivery signal clear

# 自动化等价
node ~/Work/client-platform-labs/rn/scripts/verify-l4-steel-thread.mjs .
node ~/Work/client-platform-labs/rn/scripts/verify-quality-gate.mjs .
node ~/Work/client-platform-labs/rn/scripts/verify-bf-l5-quality-gate.mjs .   # 需 host-profile=brownfield
```

---

## 4. 装包台（#15）

```bash
# 列候选 + 审计 dry-run
node scripts/distribution-console-agent.mjs ~/Work/my-rn-app --lane=production --dry-run

# 真装到手机 + 写 audit + quality signal
node scripts/distribution-console-agent.mjs ~/Work/my-rn-app --lane=production --record-signal

# 审计日志
cat ~/Work/my-rn-app/.rn/delivery/install-audit.jsonl
```

薄 CP HTTP（另开终端）：

```bash
cd ~/Work/my-rn-app
rn-delivery serve --port 4040
# GET  http://127.0.0.1:4040/v1/candidates?lane=production
# GET  http://127.0.0.1:4040/v1/registry
# POST http://127.0.0.1:4040/v1/promote  {"digest":"..."}
# POST http://127.0.0.1:4040/v1/block    {"digest":"...","reason":"..."}
```

---

## 5. BF 宿主脚手架（新仓 / 重刷）

```bash
cd ~/Work/client-platform-labs/rn
node scripts/apply-brownfield-host-stub.mjs ~/Work/my-rn-app
node scripts/scaffold-bf-rct-host.mjs ~/Work/my-rn-app
node scripts/verify-bf-rct-host.mjs ~/Work/my-rn-app
node scripts/verify-bf-bundler-url.mjs ~/Work/my-rn-app --device --skip-build --skip-install
```

---

## 6. 场景速查

| 你想… | 做什么 |
|-------|--------|
| 回归平台是否绿 | §1 全量 loop |
| 日常改 JS 真机看 | §2 `rn dev` + debug-host |
| 发候选 / OTA 钢线 | §3 delivery 串 |
| 内测包一键装机 | §4 装包台真装 |
| 新 BF 原生壳 | §5 scaffold |
| Expo 冷构建对标 | **人手**填 research/03 §9（TRUE-HITL，不进 loop） |

---

## 7. 常见失败

| 现象 | 处理 |
|------|------|
| doctor：Node 26 unsupported | `nvm use 24`；把 nvm 的 `bin` 放 PATH 最前 |
| M3b / BF-rct FAIL | 同上；loop 会尝试 re-exec Node 24 |
| steel-thread：profile is debug-host | 正常：以 registry 里 **release app-host** 为准；或再 `build --profile release` |
| adb install 卡住 | 解锁手机、确认授权；agent 默认 180s timeout |
| EADDRINUSE :8081 | 已有 Metro，勿再起第二个；复用即可 |
| H-dist-install 后日常调试怪 | release APK 盖掉 debug-host → 再 `build --profile debug-host` + `adb install -r` |

---

## 8. 报告与证据

| 文件 | 用途 |
|------|------|
| `docs/hitl/afk-hitl-loop-latest.json` | 最近一次 loop 机器可读结果 |
| `docs/hitl/m8-l4-gf-*.md` 等 | 各里程碑 HITL 签字 |
| `docs/agents/enterprise-promotion-gates.md` | 对外口径 L0–L5 |
| `.rn/delivery/registry.json` | staging / production / blocked |
| `.rn/delivery/install-audit.jsonl` | 装包台安装审计 |
