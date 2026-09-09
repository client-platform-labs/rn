# 0→1 全链路演练 · 问题台账（Findings Log）

> 演练分支：`test-rn1` · 演练对象：RN 平台（`rn-0to1-drill` 全新工程 + 真机）
> 记录规则：演练中**每发现一个问题**都登记；走完全流程后据此**开图（ticket）从系统层面一一解决**。
> 严重度：S1 阻断（流程走不通）· S2 高（有损/不安全）· S3 中（体验/一致性）· S4 低（清洁度/文档）

| ID | 阶段 | 严重度 | 问题 | 证据 | 影响 | 修复方向（ticket 素材） | 状态 |
|----|------|--------|------|------|------|------------------------|------|
| F01 | P0 密钥供应 | S3 | 密钥生成非一等公民：`ship` 无 keygen 动词，仅 `signature.ts` 内部 helper + `ota.md` 文档 `node -e` 一行 | `ship --help` 命令集无 keygen；`signature.ts:98 generateLabEd25519Pem()` | 0→1 必须从外部复制文档命令，无法体现"平台自供应密钥"；对新人/演示不友好 | 新增 `ship keygen`（生成 ed25519 PEM + 公钥 hex，写 `keys/`，权限 600）。**自动化边界**：仅自动化 lab/测试密钥链路；生产密钥仍 HITL（ADR-018：离线生成、负责人保管、异地备份、密钥事件不上自动化） | 待修复 |
| F02 | P0 密钥供应 | S3 | 烘焙公钥硬编码：`ota-android/OtaModule.kt.template` `pushString("3c728c98…")`，`apply-ota-to-project.mjs` 不参数化 | 模板第 46 行硬编码 hex；apply-ota 仅写 README 提示 | 每次换密钥都要手改模板；烘焙的未必是签名用的那把 → 设备验签必然失败 | apply-ota 增加 `--pubkey-hex`（或从 keys/ 自动读）；模板改占位符。**自动化边界**：烘焙可自动，但"用哪把公钥/哪个发布身份"由人（发布负责人）决定 | 待修复 |
| F03 | P0 工具链 | S2 | `get-rn.sh` 安装/卸载 home（`~/.client-platform/rn`）与签名密钥目录撞车；`--uninstall` 会 `rm -rf` 掉同目录密钥 | `~/.client-platform/rn/` 同时是 repo clone + `lab-sign-key.pem`；`do_uninstall` 直接 `rm -rf $HOME_DIR` | 卸载会误删信任根；安装 home 语义被污染 | 安装 home 改独立路径（如 `~/.local/share/client-platform/rn`）或密钥目录独立（`~/.client-platform/keys`）并在文档/预检中约定 | 待修复 |
| F04 | P7 设备 OTA（ADR-018 轮换） | S2 | 吊销清单消费未接通生成壳：shell-core 有 `fetchRevocations` 契约 + `verifyRevocationSeal` 实现（已单测），但工业壳/绿色壳模板都不调用 → ADR-018 应急轮换的"触达时机"在真机不生效 | `pull-ota.ts:54,63` 有钩子；模板 grep 无 `fetchRevocations`；`ed25519-verify.test.ts` 单测在但无调用方 | K1 泄露后无法免重装轮换（信任根恢复路径断）；回滚窗口内吊销不生效 | 生成壳模板（industrial-shell / greenfield-ota）接通 `fetchRevocations`（从 CP `/v1/revocations` 或类似端点拉 + 用烘焙 K2 验），并加真机探针 | 待修复 |
| F05 | P0 密钥供应 | S2 | 密钥托管/连续性**不是平台能力，只是文档建议**：现状私钥在发布负责人本地（`RN_DELIVERY_SIGN_KEY_FILE` 本地文件）；无线上托管、无双人保管/解密权分离实现；人员离职/转岗无平台级处置（仅 roles-matrix 建议 age 加密异地备份，靠人自觉） | `ota.md` "生产密钥由负责人离线生成并异地保管"为文档建议；无任何托管命令/存储/审计实现 | 发布负责人转岗/离职 = 信任根真实风险；企业审计会问"钥匙到底在哪、谁还能碰" | 把密钥连续性做成平台能力：托管存储（age 加密 + 解密权分离）+ 人员变更触发轮换（K1→K2）流程化 + 审计；或明确定位为"文档约定 + 外部 HSM 接入" | 待修复 |
| F06 | P0 密钥供应（ADR-018） | S2 | 双钥（K1+K2）**未实现，与 ADR-018 不符**：keygen 只出一对钥；`OtaModule.kt.template` 只烘焙一把（单 `pushString`）；“双钥免重装轮换”是设计文档非现状 | `signature.ts:98` 单对返回；模板第 46 行单 hex | ADR-018 承诺的“1 次 OTA 应急轮换”无法兑现；自研设计与实现漂移 | **已决策 B（2026-09-09）**：弃用自研双钥，对齐行业主流——单签名钥 + HSM 托管（签名在 HSM 内完成）+ 证书链（签名证书由根 CA 签发，设备端验链）+ CRL/OCSP 吊销；设备端信任根改为烘焙根 CA 公钥（业务钥轮换不动设备）。改造面：core 验签链（X.509+CRL/OCSP）· ship sign 对接 HSM/PKCS#11/KMS · 模板烘焙根 CA · CP 吊销端点 · 设备端 pull-ota 验链 · ADR-017/018 修订 | 待修复（演练后开 ticket） |
| F07 | P0 工具链 | S3 | 卸载入口不一致且 `rn self uninstall` 不完整：完整一键卸载只有 `get-rn.sh --uninstall`（删 rn/ship 链接+ENV_FILE+安装 home）；`rn self uninstall` 漏删 `~/.local/bin/ship`、ENV_FILE、安装 home（~/.client-platform/rn clone） | `self.ts` 遍历仅 ["rn"]、npm unlink rn+ship、markers；get-rn.sh `do_uninstall` 才删 ship/ENV_FILE/home | 用户按文档（cli-distribution.md）用 `rn self uninstall` 卸载会留下大量残余；两个入口行为不一致 | 演练后统一：A) 补全 `rn self uninstall`（+ship/+ENV_FILE/+安装 home）与 get-rn.sh --uninstall 对齐；B) 或文档把 `get-rn.sh --uninstall` 定为唯一卸载入口，`rn self uninstall` 降为只卸 CLI 自身 | 待修复 |

---

## 密钥信任模型边界（供 F01/F02 修复设计引用）

自动化消除的是**非必要体力步骤**，不是信任角色：

| 环节 | Lab/测试密钥（自动化） | 生产密钥（HITL，ADR-017/018） |
|------|------------------------|------------------------------|
| 生成 | `ship keygen` 一条命令 | 离线生成、负责人保管、异地备份 |
| 烘焙 | apply-ota 参数化自动写公钥 | 公钥烘焙可自动；"用哪把"由人定 |
| 签名注入 | `RN_DELIVERY_SIGN_KEY_FILE` 自动 | 负责人授权注入、批准发布 |
## 信任根连续性（Q1 补充：人员变更）

发布负责人转岗/离职不是风险：
- **可用性靠托管**：私钥 age 加密异地备份（与 ADR-014 DR 同流程），解密权由另一人（托管人）持有——双人保管、解密权分离。
- **安全性靠轮换**：转岗/离职 = 授权终止 → 触发 K1→K2 轮换（ADR-018 一次免重装轮换），旧负责人副本立即失效。
- 两个机制都独立于"那个人"。

## 密钥模型决策（F06 → 行业主流）

- **决策 D3（2026-09-09）**：弃用自研双钥（ADR-018），对齐**行业主流**——单签名钥 + HSM 托管 + 证书链（根 CA 签发）+ CRL/OCSP 吊销。理由：自研双钥未解决现有问题且无大厂实践；主流方案经大量实际项目验证。
- 原则：除非自研方案能证明比大厂实践更优，否则用主流方案。
- 范围（演练后开 ticket）：core 验签链（X.509+CRL/OCSP）· ship sign（HSM/PKCS#11/KMS 对接）· 模板（烘焙根 CA）· CP（吊销端点）· 设备端运行时（验链）· ADR-017/018 修订。
- 由此带来的新能力：业务签名钥可多次轮换且不动设备（证书链保证）；吊销走行业标准 CRL/OCSP；私钥不出 HSM。

## 演练过程追加（按 Phase 增量记录）

### P0 — 环境与密钥供应（进行中）

- 决策 D1：采用方案 A —— 走**现状**如实演示（`node -e` 生成 lab 密钥 → 手动烘焙新公钥），缺口记为 finding（F01/F02），演练后统一开图解决。
- 决策 D2：0→1 不使用机器上预置的历史密钥（`~/.client-platform/rn/lab-sign-key.pem`），改为**新生成** lab 密钥（`rn-0to1-drill/keys/`）。
- 记录：新 lab 公钥 hex = `93431af7918536fd567876d2da79d0dfdadaaec56d13a577ad2a312a0322a258`（P4 烘焙用；私钥在 `rn-0to1-drill/keys/lab-sign-key.pem`，600）

_（后续阶段发现的问题在此追加，保持本表为主索引。）_
