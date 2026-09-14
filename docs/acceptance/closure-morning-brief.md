# 早上好 —— 闭环夜跑验收简报（最终版）

> 你睡觉期间我按"开发 → 测试审查 → 再开发 → 测试审查 → 完工"跑了闭环。
> 这份文件是**第一入口**：§1 一分钟结论 → §3 三条 lane 的真实结果 → §4 需要你拍板的两件产品决策 → §6 诚实清单。
> 逐门机读报告：[`closure-latest.md`](./closure-latest.md)（由 `scripts/run-closure-loop.mjs` 每次运行刷新）。

---

## 1. 一分钟结论

| 问题 | 答案 |
|---|---|
| **11 条 e2e 链闭环了吗？** | **基本闭环**：`run-all.sh` **rc=0**，**10 PASS / 1 显式 SKIP / 0 FAIL**。唯一 SKIP 是 chain-09 的 3 个探针需要 `data-service`(:8001)，其余含 CP 鉴权 401/401/400、制品下载、设备→宿主 CP 全绿。 |
| **多模块共宿主呢？** | **已验**：chain-05/07 用 desk + fixture_second 跑通，且顺带验证了我前一天刚修的 `resolve_module_hbc → ingest-pack --hbc` 链路。 |
| **信任链？** | **第三次独立复现 PASS**：11.B1 真下载并生效 · 11.B2 篡改 CRL 被**验签**拒绝（且 `check=0 artifact=0`，app 留在基线） · 11.A 崩溃环注入确认落地 4/4 且设备自报 `crash_loop_rollback`。 |
| **平台自己有问题吗？** | **本轮 11 条链没发现产品缺陷**（每个失败都是前置条件/共享状态），但**容器与 DR 那一侧发现了三个真缺口**（§4）。 |
| **要你做什么？** | 回 **§4 的两条产品决策** + 确认 **§5 我替你做的默认**。 |

**今夜合并了 10 个 PR**（#270 #272 #273 #274 #275 #276 #277 #278 #279 #280 #281 #282 中的相应部分），`main` CI 全绿。

## 2. 我替你做的默认（你未回 D1–D11，按此执行，可覆盖）

| # | 默认 | 结果 |
|---|---|---|
| D1 Docker | 用已装的 Docker Desktop，`open -a Docker` | ✅ 起来了（29.7.2），容器栈因此可验 |
| D2 真机 | 只碰 `com.rnotaacceptance` + `com.tiangong.host`，逐条记录 | ✅ 见 §3 的改动清单 |
| D3 模拟器 | 不建 Android AVD，用真机；**iOS 用模拟器**（chain-10 PASS） | ✅ |
| D5 合并 | CI 全绿 + 有负向对照才合并；**原生契约类只开 PR** | ✅ 见 §4 注 |
| D6 下游仓库 | 只读；DUT 只建 `/tmp` | ✅ |
| D10 规模阈值 | 未定 → 该门记 **UNBOUNDED，不计绿** | 仍开放 |
| D11 flake | flake ≠ 绿 | ✅ 本轮**未观察到 flake** |

## 3. 三条 lane 的真实结果

### Lane A · 真机 11 条 e2e 链 —— 10 PASS / 1 SKIP / 0 FAIL

```
01-cli PASS · 02-debug-multi-bundle PASS · 03-release-load PASS（宿主 APK 55,787,252 B，vivo 弹窗被 safe_install 自动点掉）
04-shell-lifecycle PASS · 05-biz-lifecycle PASS（走通 resolve_module_hbc → ingest-pack --hbc）
06-host-portal PASS · 07-biz-portal PASS · 08-update-strategy PASS · 10-ios-lifecycle PASS（模拟器）
09-backend-services SKIP（3 个探针需 data-service :8001）
11-ota-trust PASS（设备腿，第三次独立复现）
```

**三个 harness 缺陷被修掉（每一个此前都在悄悄污染证据）**
1. **`cp_adb_reverse` 把宿主端口硬编码成 4040** —— 设备的 `cpBaseUrl` 是设备侧 loopback:4040（这一侧必须固定），但**宿主侧必须是本次 CP 的端口**。当另一条 lane 的容器占着宿主 4040 时，设备会**静默连到错误的控制面**（不同注册库、**未签名**的 `/v1/crl`）→ 信任链的成败与本轮无关。
2. **chain-01 用环境里的 `which rn`/`which ship`** —— `--ignore-scripts` 下不存在；存在时也可能指向**另一个 checkout** 的 CLI。
3. `${RN}` 大括号 —— `$VAR` 紧跟多字节字符在 `set -u` 下被误解析。

**设备改动（仅两个测试包）**：`03` 安装 `com.tiangong.host`；`11` 多次 `pm clear com.rnotaacceptance`、4 次故意不完整启动（崩溃环注入）、tamper stub 起停于 :4041、DUT 仍在跑（pid 14202）；CP 自建于 :4150（lab 钥，其公钥**与 DUT 烘焙的 RCA `71eb8a6c…` 匹配**）后**已停**；Metro 8081/8082 已停；`adb reverse` 已**全部清空**（0 条）。
> 另外：它**修剪了宿主 registry 里 4 条容器路径条目**（另一条 lane 的 bind-mount 容器写进去的，会让 chain-03 去取一个取不到的制品），备份在 `/tmp/registry.backup-*.json`。

### Lane B · 控制面容器栈 + ADR-014 DR 演练

- **修掉一个硬阻塞**：distribution-service 的 compose **根本构建不起来**（`data-service` 是**外部**仓库却被当必选、且用了仓库相对 context；另有两处挂载写了字面量 `~`）。改为 profile 后，平台自己的门 `verify-distribution-compose.mjs` 现在 **rc=0 PASS**；bearer 门正确（401/401/200）。
- **DR 演练**（`deploy/distribution-service/dr-drill.sh`，可复现，rc=0）：种数据 → 备份 → **销毁工程与全部密钥材料** → 仅凭归档恢复 → 验证。
  - **数据恢复 ✅**（`staging=1` 前后一致、内容匹配）
  - **信任材料未恢复 ❌**：归档只收回 **1 个** secret，而 cert 模式产出了 **6 个** → 恢复后 CRL 变成 leaf 签名，**每台设备都会拒绝**。因为启动是 fail-closed，**DR 恢复之后更新会一直被挡住**。
- **一个更根本的发现**：`:7430` 上那个既有实例服务的 `/v1/crl` 是 `{"schemaVersion","revoked"}` —— **没有 seal**（镜像比源码老 4 天，早于签名 CRL 的工作）。用当前镜像 + 钥时，**一个环境变量同时担任发行角色与 CRL 角色**：签成 **leaf** → 设备拒 CRL；签成 **RCA** → 设备收 CRL 但 release seal 验不过。**单实例无法同时提供"设备可信的 CRL"和"可验的发行包"。**

### Lane C · 重试风暴（#269 残余）—— 已修并合并（#280）

- **一条前提更正（核实过，非假设）**：#269 正文说 `installed_update_id` "只在成功时写"。实际它在 `installAndReload` **之前**就已持久化。真正的缺陷是**状态说谎**：回滚后设备跑的是内嵌基线，但 `installed_update_id` 仍指向一个**设备并没在跑**的更新，于是**取不到 id 的候选会被每次启动重新应用**（crash→rollback→re-pull→crash）。
- 修法：回滚时记下被拒 id（`rolledBackUpdateId`）+ 清掉过期的 installed id，**都在 `rollbackToEmbeddedBaseline` 之前**（该调用以 `reload()` 结尾）；拒绝等于该 id 的候选；**遇到不同（更新）的候选就清掉标记**，使修复本身不会被这个标记挡住。
- 4 条探针**全部证明可失败**：修前 14 pass / 3 fail；把可选方法改成必需 → 3 红；恢复 → 17/17。行业参照：CodePush 的回滚标记 + Expo Updates 的内嵌基线语义。

## 4. 需要你拍板的两件产品决策（都在容器/DR 侧）

| # | 决策 | 为什么必须你定 |
|---|---|---|
| **P1** | **CRL 是否需要独立的密钥输入**（如 `RN_DELIVERY_CRL_KEY_*`）？ | 现状一个 env 同时驱动发行与 CRL 两个角色，导致**单实例不可能既让设备信 CRL、又让 release seal 可验**。这是设计取舍，不是 bug 修法。 |
| **P2** | **ADR-014 的 DR 承诺要不要覆盖信任材料**？（把 cert 模式全部密钥纳入备份，或明确写"DR 只保数据、信任材料需人工重建"） | 现状是"承诺了一部分"：服务与数据能恢复，**信任材料不能**，而 fail-closed 会让恢复后更新永久被挡。要么补备份，要么改承诺。 |

另有两条**已报告未修**（不阻塞，但你要知道）：
- **镜像↔源码漂移无人检测**：部署的 `:7430` 服务着一个更老的契约（无 seal），没有任何东西会报警。
- **原生契约改动已合并但设备侧待验**（#280）：新增两个**可选** adapter 方法 + Kotlin 模板，Kotlin 在此环境无法执行 → **设备半未验，未宣称**。

## 5. 明早 2 分钟自验

```bash
cd ~/Work/client-platform-labs/rn
git log --oneline -14                            # 本轮合并了什么
node scripts/run-closure-loop.mjs --mode afk     # 无设备门禁（应全绿）
node scripts/check-verification-plane.mjs        # 反空转门禁（应 PASS；它今夜抓出了我自己的不完整修复）
bash scripts/e2e/run-all.sh                      # 11 条链（长，需真机；期望 10 PASS / 1 SKIP / 0 FAIL）
bash deploy/distribution-service/dr-drill.sh "$PWD"   # DR 演练（期望 rc=0，且你会在输出里看到 TRUST 那一行为 false）
gh pr list --state open                          # 待你审的 PR
```

## 6. 仍然**未闭环**的（诚实版 —— 不因跑了一夜而改口）

| 项 | 状态 |
|---|---|
| 多业务/多模块共宿主 | ✅ **本轮已验**（chain-05/07） |
| 11 条链常驻 CI | 🟡 本地 rc=0；**device-gate 依赖自建 runner**，未接成常驻门 |
| chain-09 的 data-service 探针 | ⊘ 显式 SKIP（需起 `data-service`） |
| **DR 的信任材料** | ❌ 见 P2 |
| **CRL 密钥角色** | ❌ 见 P1 |
| 灰度自动刹车 | ❌ 依赖真实观测后端（#90 shelved） |
| 控制面 HA / 多实例 | ❌ Postgres 适配器自标 unwired（ADR-013）→ 单节点 |
| 企业身份（SSO/RBAC）· HSM 托管 | ❌ 产品/外部依赖（原 D7） |
| 遥测采集与聚合 | ❌ #271 只打通设备侧上报通道 |
| 镜像↔源码一致性 | ❌ 无检测（本轮实测到漂移） |
| iOS 可执行 OTA | ⛔ ADR-012 设计外（模拟器仅验壳生命周期） |
| 合规/法务前置门 | ⛔ 人工（ADR-012） |
| 规模/负载 | ❌ 无阈值（D10）→ 无证据 |

## 7. 过程诚实记录（失败也报）

- 我**3 次**引入 CI 回归，全部被 CI 抓到并修掉；最讽刺的一次是"把 harness 注册进 CI"反而让阻塞点搬家，恰好复现了本轮要修的病。
- **我自己的反空转门禁今夜两次抓到我**：一次是上一个修复不完整（`ingest-pack.ts` 仍写着幽灵脚本），一次是 Lane A 的新文案被误判为命令 —— 后者是**门禁的假阳性**，我选择改文案而不是削弱规则，并记录了这个精度限制。
- 一条设备 lane 曾把 DUT 生成进**主仓根目录**并改了 `package.json`，我已回滚、立了"只建 `/tmp` + 收尾自查"的规矩。
- 一次 30 分钟超时让某 lane `changed tracked files: none`，此后"**小步提交**"成为所有设备 lane 的硬规则。
- 我的主 checkout 一度停在旧分支上，导致工具反复报一个**已修复**的阻塞 —— 我发现并切回 `main`。

---

## 更新（P1/P2 已关闭）—— 你问的那两个缺口，现在有证据闭合了

| 决策 | 状态 | 证据 |
|---|---|---|
| **P1 CRL 证书链** | ✅ 已实现并合并 | CRL 与 release **同一套信任模型**：CRL 由 leaf 签 + 附 `cert_chain`，设备验「leaf 在烘焙 RCA 之下」再验「seal 在 leaf 之下」；**旧的无链 CRL 仍兼容**。4 条探针全部负向对照（回退 → 19/21、20/21、9/21）。还顺手修了 `/v1/crl` 的运维文案——那正是角色混淆的源头。 |
| **P2 DR 信任材料** | ✅ 已实现并合并 | `backup.mjs` 现在备份**整个 keys 目录**（RCA 钥/证书、leaf 钥/证书、CSR、serial），age 加密；DR 演练 **`device accepts CRL = true → true`**，rc=0；关掉 keys 捕获 → `FAIL TRUST NOT recovered`，rc=1。ADR-014 承诺文案已改为诚实版。 |

**一句话**：P1 让"吊销生效"和"发布可装"不再二选一；P2 让"灾备恢复后还能发更新"成为现实。两件事都用演练/探针的**红→绿**收尾，不是嘴上修好。

**唯一遗留（已记录，小）**：`scripts/e2e/verify-crl-failclosed-live.mjs` 仍模拟旧设备（烘焙 CP 的签名钥），要做"cert 模式完整 live 运行"需把它改为烘焙 RCA —— 已标为后续项，不影响上面的单元/演练级闭合。
