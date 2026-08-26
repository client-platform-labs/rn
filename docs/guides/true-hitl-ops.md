# TRUE-HITL 人手操作指南（剩 4 项）

**这不是** [`afk-hitl-ops.md`](./afk-hitl-ops.md)（那份是已自动绿的 Spine/AUTO loop）。  
**这是** loop 末尾 `TODO` 里仍要**你本人**做、或**人眼验收**的四项。

| ID | Issue | 性质 | 你要做什么 |
|----|-------|------|------------|
| **T-expo-cold** | [#19](https://github.com/client-platform-labs/rn/issues/19) | **真人手计时** | 同机建 Expo Dev Client，秒表/计时填 §9 Expo 列 |
| **T-expo-interop** | [#16](https://github.com/client-platform-labs/rn/issues/16) | **大半可 AFK 写代码**；人手只验 dry-run 输出 | 见 §2（实现完后点几下确认即可） |
| **T-harmony** | Map B | **暂无执行面** | 只能做合同/环境预备；真机要等 Harmony toolchain |
| **T-cp-web** | [#7](https://github.com/client-platform-labs/rn/issues/7) | **先 AFK 做 Web，再人手点演示** | 见 §4 |

---

## 1. T-expo-cold — Expo 同机 bench（#19）

**目标：** 填满 [research/03 §9](../../wayfinding-impl-2/research/03-expo-dev-experience-system-analysis.md) 表里的 **Expo 列**（RN 列已有 loop / M4 数据）。

**条件：** 与测 `my-rn-app` **同一台 Mac、同一部手机、同一网络**。

### 1.1 建 Expo 对照组

```bash
# 建议单独目录，勿写进平台仓
npx create-expo-app@latest ~/Work/expo-bench --template blank
cd ~/Work/expo-bench
npx expo install expo-dev-client

# 按当前稳定 SDK 文档生成原生工程并装 Dev Client
npx expo prebuild --platform android
# 或使用 EAS / Android Studio 构建带 Dev Client 的 debug APK 后：
adb install -r <path-to-dev-client.apk>
```

### 1.2 计时（秒表或 `/usr/bin/time`）

| 指标 | 你怎么测 | 记到哪里 |
|------|----------|----------|
| `dev.cold.first_screen` | **清空构建缓存后**首次 `npx expo start` + 真机打开 Dev Client 到首屏可见；记 wall-clock | research/03 §7 表 Expo 列 + `docs/bench/expo-vs-rn-YYYYMMDD.jsonl` |
| `dev.warm.reload` | Dev Client 已连上；改一行 JS → 真机可见；记秒 | 同上 |
| `dev.failfast.no_device` | `adb disconnect`；再跑 Expo 开 Android；到明确失败的时间 | 同上 |
| `dev.transport.modes` | 数 Expo 实际可用：USB / LAN / tunnel（文档+实测） | 填数字，如 `3` |

RN 侧对照（已自动，可再采一次）：

```bash
cd ~/Work/client-platform-labs/rn
node scripts/bench-expo-parity.mjs ~/Work/my-rn-app
# → docs/bench/expo-vs-rn-*.jsonl
```

### 1.3 回写验收

1. 改 `wayfinding-impl-2/research/03-expo-dev-experience-system-analysis.md` §7：**Expo 列不再「待测」**  
2. `gh issue comment 19` 贴 JSONL 路径 + 四指标数字  
3. Acceptance 勾选 cold / warm.reload / failfast / transport.modes  

**Done 标准：** Expo 四指标有数，且与 RN 同机可比。

---

## 2. T-expo-interop — Expo 互操作轨（#16）

**澄清：** 票面 Mode=**AFK**，验收是 schema / `rn doctor --profile expo` / `rn migrate --from expo --dry-run`——**不是**你去手点 Expo 迁移全工程。  
之前 loop 把它标成 TRUE，是因为「产品是否开轨」需人拍板；**实现本身可丢给 Agent**。

### 2.1 你要拍的板（5 分钟）

- [ ] 确认 v1 **只做探测+dry-run**，不做自动脱 Expo（票已写 Out of scope）  
- [ ] 指定一个 fixture 路径（或同意用临时 `create-expo-app` 工程做 dry-run 样本）

### 2.2 Agent / 你可 AFK 实现后，人手只验

```bash
# 实现落地后（尚无则先开 #16 给 Agent）：
rn doctor --profile expo --cwd ~/Work/expo-bench
rn migrate --from expo --dry-run --cwd ~/Work/expo-bench
# 期望：稳定 JSON（轨 0/1/2 建议 + 风险清单），exit 0
```

**你的人手动作：** 看 dry-run JSON 是否合理 → `gh issue comment 16` 贴一份输出 → 勾 Acceptance。

**若暂不实现：** 在 #16 标 `priority:p3` 挂起即可，**不挡** GF/BF L5。

---

## 3. T-harmony — Harmony 真机（Map B）

**现状：** 合同里有 `artifact_line` / Harmony 预留；**本机无 HarmonyOS 真机 toolchain 执行面**。  
**你现在能做的只有预备，不能「装包点开」级 HITL。**

### 3.1 人手预备清单

1. **硬件：** 准备 HarmonyOS 真机或官方模拟器账号/镜像来源（公司内渠道）  
2. **SDK：** 记录 DevEco Studio / OHPM 版本，写入 Map B 开工 issue  
3. **合同：** 确认 `harmony-host` 与 Android **分 `artifact_line`**（勿同发）——见 research/04 C13  
4. **开票：** `gh issue create`（label `wayfinder:map` 或 Map B task）标题示例：`[map-b] Harmony 真机钢线：doctor → debug-host 等价 → 一 module js-update`

### 3.2 有 toolchain 之后的操作骨架（届时再细化）

```text
Harmony 工程接入 host-profile
  → 合同探测（doctor harmony profile，待建）
  → 出 harmony-host 候选包
  → 真机装包 + 一 module Surface
  → 同一 rn-delivery promote/block（身份字段不变）
```

**Done 标准（远期）：** 真机一张 HITL md + verify 脚本进 loop（届时升为 AUTO-HITL）。

---

## 4. T-cp-web — CP Web 控制台 UX（#7）

**已有（自动）：** `rn-delivery serve`（`GET /v1/registry|candidates`，`POST promote|block`）。  
**没有：** 浏览器里的发布单 / 灰度 / Kill UI。

### 4.1 实现（可 AFK，不挡你今天）

按票 #7 建议包：

```text
packages/control-plane-api/   # 可先把 serve 迁成独立 API
packages/control-plane-web/   # 列表 / promote / block / 审计时间线
```

最小可演示：读同一 `.rn/delivery/registry.json`（或调 `serve` HTTP）。

### 4.2 你的人手验收（Web 起来之后）

```bash
# 终端 1：API
cd ~/Work/my-rn-app
rn-delivery serve --port 4040

# 终端 2：Web（示例，路径以实现为准）
cd ~/Work/client-platform-labs/rn/packages/control-plane-web
pnpm dev   # 假设打开 http://127.0.0.1:5173
```

**点击剧本（票 #7 演示脚本）：**

1. 打开 Web → 能看到 staging / production 候选（digest、module）  
2. 选一条 js-update → **Promote** → registry production 变化（或 API 返回 ok）  
3. **Block** 同一 digest → blocked 列表出现  
4. （可选）对照 CLI：`rn-delivery promote` / `block` 与 UI 一致  
5. 截图或录 30s → `docs/hitl/cp-web-ux-YYYY-MM-DD.md` + `gh issue comment 7`

**今日无 Web 时的替代人手（仅 API 烟测，不算 UX Done）：**

```bash
curl -s http://127.0.0.1:4040/v1/candidates?lane=production | jq .
# 人眼看 JSON 即可；勾「API 可演示」，不要勾「Web UX Done」
```

---

## 5. 建议你怎么排期

| 顺序 | 项 | 耗时感 | 依赖 |
|------|----|--------|------|
| 1 | **#19 Expo 冷/温计时** | 0.5–2h（含 Dev Client 构建） | 同机同设备 |
| 2 | **#7 Web 点一轮** | 实现另计；点验收 15min | 需先有 Web 或只验 API |
| 3 | **#16** | 拍板 5min；实现 AFK | 不挡推广 |
| 4 | **Harmony** | 等设备/SDK | Map B |

推广口径 **GF L5 · BF L5** **不依赖**这四项做完。

---

## 6. 和自动 loop 的关系

```text
afk-hitl-ops / run-afk-hitl-loop.mjs  → 已 PASS（你不用再跑来「完成」这四项）
本文 TRUE-HITL                          → 人手填数 / 点 UI / 开 Map B
```

做完一项就：更新 research 或 HITL md → `gh issue comment` → 若 Acceptance 满了再考虑 `gh issue close`。
