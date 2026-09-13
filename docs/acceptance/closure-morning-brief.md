# 早上好 —— 闭环夜跑验收简报

> 你睡觉期间我在跑"开发 → 测试审查 → 再开发 → 测试审查 → 完工"闭环。
> 这份文件是**第一入口**；细节在文末的链接里。

**状态**：本简报先落盘（防止夜间中断导致无可读产物），三条 lane 正在跑；
每条 lane 落地后我会回填下方结果表。自动生成的逐门报告见
[`closure-latest.md`](./closure-latest.md)（由 `scripts/run-closure-loop.mjs` 每次运行刷新）。

---

## 1. 一分钟结论

| 问题 | 当前答案 |
|---|---|
| 平台各环节是否全部闭环？ | **还没有**。今晚的目标是把"到底哪些环节闭环"从**未知**变成**有证据的已知**，并把能在无人值守下修掉的缺口修掉。 |
| main 现在什么状态？ | **CI 全绿**（本轮已合并 6 个 PR），且新增了两道**"反空转"门禁**（见 §3）——它们当场就抓出了我自己的一个**不完整修复**。 |
| 需要你做什么？ | 只回 **§4 的 7 条决定**（我按标注的默认值先跑了，你有异议随时改）。 |

## 2. 夜间跑的三条 lane（结果回填区）

| Lane | 目标 | 结果 |
|---|---|---|
| **A · 真机 11 条 e2e 链** | 端到端每链 PASS/FAIL/SKIP + 证据；只修 harness/前置缺陷，产品缺陷只报不修 | ⏳ 待回填 |
| **B · 控制面容器栈 + DR 演练** | 起真实 compose 栈（cp/distribution/data-service）+ 验 `/v1/health`、令牌门禁、**签名 CRL**；然后做 ADR-014 的**冷重建**演练（此前从未演练过） | ⏳ 待回填 |
| **C · 重试风暴修复** | 坏版本在回滚后仍被反复重拉（#269 记载的残余）→ 原生侧标记"已回滚更新"+ 探针 | ⏳ 待回填 |

## 3. 今晚已经完成并合并的

1. **`scripts/run-closure-loop.mjs`（闭环驱动，R0→R3）** —— 你要的"全自动修复闭环"本体。入口：
   ```bash
   node scripts/run-closure-loop.mjs --plan        # 门禁图
   node scripts/run-closure-loop.mjs --mode afk    # 无设备门禁
   node scripts/run-closure-loop.mjs --mode all    # + 真机 + 容器
   ```
   已跑出**第一份真实基线**：`4 pass · 0 fail · 2 skip · 1 todo`。
2. **反空转门禁 `check-verification-plane.mjs`** —— 把本次发现的 6 类"看起来在验、实际没验"变成 CI 强制的检查（测试 glob 覆盖 · 链的 0/1/2 退出码 · **幽灵命令三分法** · 探针死引用）。带 10 条负向对照。
   **它立刻生效了**：合并后它抓出我上一个修复**不完整**（`ingest-pack.ts` 仍两处写着幽灵脚本），我修完它才转绿。
3. **业务模块 OTA 的 HBC 链路修复** —— `ingest-pack` 的 flag 是 `--hbc` 而两条链传的是不存在的 `--bundle`（被**静默忽略**，回落到默认路径），且 chain-05 调了一个**不存在的** `ship build pack --out-dir`。现在由 `resolve_module_hbc` 显式解析，缺失即**带原因的 SKIP**，不再静默。
4. Docker daemon 我起好了（Docker Desktop 已装）—— 原本它是"唯一缺失环节"。

## 4. 需要你回的决定（我按默认值先跑了，可覆盖）

| # | 决定 | 我今晚的默认 |
|---|---|---|
| D1 | Docker 怎么起 | ✅ 已解决：用已装的 Docker Desktop，`open -a Docker` 即可 |
| D2 | **真机授权**（会反复装/覆盖 APK、`pm clear`） | 仅限测试包 `com.rnotaacceptance` 与参考宿主 `com.tiangong.host`，逐条记录改动 |
| D3 | 要不要建 Android 模拟器（~1–2GB 镜像） | 暂不建，用真机 |
| D5 | **合并授权** | 仅当 CI 全绿 + 有负向对照证据才合并自己的 PR；**原生契约类改动只开 PR 等你审**（见 lane C） |
| D6 | 可否改动 `~/code/{desk,fixture_second,tiangong-host}` | 只读；DUT 只建 `/tmp` |
| D10 | "规模/负载"阈值 | 未定 → 该门记 **UNBOUNDED，不计绿** |
| D11 | flake 政策 | **flake ≠ 绿**：记抖动率并开票 |

## 5. 明早 2 分钟自验

```bash
cd ~/Work/client-platform-labs/rn
git log --oneline -12                      # 本轮合并了什么
node scripts/run-closure-loop.mjs --mode afk   # 无设备门禁（应全绿）
node scripts/check-verification-plane.mjs      # 反空转门禁（应 PASS 且 0 phantom）
gh pr list --state open                        # 等你审的 PR（尤其原生契约类）
```

## 6. 仍然"未闭环"的清单（诚实版，不因跑了一夜而改口）

- **多业务/多模块共宿主真机** —— Lane A 的 chain-05/07 会给答案
- **灰度自动刹车** —— 依赖真实观测后端（#90 shelved），今晚不解决
- **控制面 HA / 多实例** —— Postgres 适配器自标 unwired（ADR-013）
- **企业身份（SSO/RBAC）· HSM 托管** —— 产品/外部依赖，等 D7 选型
- **遥测采集与聚合** —— #271 只打通了设备侧上报通道
- **iOS 可执行 OTA** —— ADR-012 设计外
- **合规/法务前置门** —— 人工，平台不自证
- **规模/负载** —— 无阈值（D10）→ 无证据
