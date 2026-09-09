# 0→1 全链路演练 · 问题台账（Findings Log）

> 演练分支：`test-rn1` · 演练对象：RN 平台（`rn-0to1-drill` 全新工程 + 真机）
> 记录规则：演练中**每发现一个问题**都登记；走完全流程后据此**开图（ticket）从系统层面一一解决**。
> 严重度：S1 阻断（流程走不通）· S2 高（有损/不安全）· S3 中（体验/一致性）· S4 低（清洁度/文档）

| ID | 阶段 | 严重度 | 问题 | 证据 | 影响 | 修复方向（ticket 素材） | 状态 |
|----|------|--------|------|------|------|------------------------|------|
| F01 | P0 密钥供应 | S3 | 密钥生成非一等公民：`ship` 无 keygen 动词，仅 `signature.ts` 内部 helper + `ota.md` 文档 `node -e` 一行；且**无规范密钥存放位置**（canonical key home），密钥只能随手放置 → 曾发生放入工程目录撞 init 空目录检查 | `ship --help` 命令集无 keygen；`signature.ts:98 generateLabEd25519Pem()`；本次演练 keys 放工程目录被 init 拒 | 0→1 必须从外部复制文档命令；密钥位置靠用户/助手猜 | 新增 `ship keygen`（生成 ed25519 PEM + 公钥 hex，权限 600）+ **定义规范密钥位置**（如 `~/.client-platform/keys/` 或工程 `.rn/keys/`，init 之后放工程内则 gitignore）；init 默认产品化（D4）时烘焙从规范位置读（F02）。**自动化边界**：仅 lab/测试密钥自动化；生产 HITL（ADR-018） | 待修复 |
| F02 | P0 密钥供应 | S3 | 烘焙公钥硬编码：`ota-android/OtaModule.kt.template` `pushString("3c728c98…")`，`apply-ota-to-project.mjs` 不参数化 | 模板第 46 行硬编码 hex；apply-ota 仅写 README 提示 | 每次换密钥都要手改模板；烘焙的未必是签名用的那把 → 设备验签必然失败 | apply-ota 增加 `--pubkey-hex`（或从 keys/ 自动读）；模板改占位符。**自动化边界**：烘焙可自动，但"用哪把公钥/哪个发布身份"由人（发布负责人）决定 | 待修复 |
| F03 | P0 工具链 | S2 | `get-rn.sh` 安装/卸载 home（`~/.client-platform/rn`）与签名密钥目录撞车；`--uninstall` 会 `rm -rf` 掉同目录密钥 | `~/.client-platform/rn/` 同时是 repo clone + `lab-sign-key.pem`；`do_uninstall` 直接 `rm -rf $HOME_DIR` | 卸载会误删信任根；安装 home 语义被污染 | 安装 home 改独立路径（如 `~/.local/share/client-platform/rn`）或密钥目录独立（`~/.client-platform/keys`）并在文档/预检中约定 | 待修复 |
| F04 | P7 设备 OTA（ADR-018 轮换） | S2 | 吊销清单消费未接通生成壳：shell-core 有 `fetchRevocations` 契约 + `verifyRevocationSeal` 实现（已单测），但工业壳/绿色壳模板都不调用 → ADR-018 应急轮换的"触达时机"在真机不生效 | `pull-ota.ts:54,63` 有钩子；模板 grep 无 `fetchRevocations`；`ed25519-verify.test.ts` 单测在但无调用方 | K1 泄露后无法免重装轮换（信任根恢复路径断）；回滚窗口内吊销不生效 | 生成壳模板（industrial-shell / greenfield-ota）接通 `fetchRevocations`（从 CP `/v1/revocations` 或类似端点拉 + 用烘焙 K2 验），并加真机探针 | 待修复 |
| F05 | P0 密钥供应 | S2 | 密钥托管/连续性**不是平台能力，只是文档建议**：现状私钥在发布负责人本地（`RN_DELIVERY_SIGN_KEY_FILE` 本地文件）；无线上托管、无双人保管/解密权分离实现；人员离职/转岗无平台级处置（仅 roles-matrix 建议 age 加密异地备份，靠人自觉） | `ota.md` "生产密钥由负责人离线生成并异地保管"为文档建议；无任何托管命令/存储/审计实现 | 发布负责人转岗/离职 = 信任根真实风险；企业审计会问"钥匙到底在哪、谁还能碰" | 把密钥连续性做成平台能力：托管存储（age 加密 + 解密权分离）+ 人员变更触发轮换（K1→K2）流程化 + 审计；或明确定位为"文档约定 + 外部 HSM 接入" | 待修复 |
| F06 | P0 密钥供应（ADR-018） | S2 | 双钥（K1+K2）**未实现，与 ADR-018 不符**：keygen 只出一对钥；`OtaModule.kt.template` 只烘焙一把（单 `pushString`）；“双钥免重装轮换”是设计文档非现状 | `signature.ts:98` 单对返回；模板第 46 行单 hex | ADR-018 承诺的“1 次 OTA 应急轮换”无法兑现；自研设计与实现漂移 | **已决策 B（2026-09-09）**：弃用自研双钥，对齐行业主流——单签名钥 + HSM 托管（签名在 HSM 内完成）+ 证书链（签名证书由根 CA 签发，设备端验链）+ CRL/OCSP 吊销；设备端信任根改为烘焙根 CA 公钥（业务钥轮换不动设备）。改造面：core 验签链（X.509+CRL/OCSP）· ship sign 对接 HSM/PKCS#11/KMS · 模板烘焙根 CA · CP 吊销端点 · 设备端 pull-ota 验链 · ADR-017/018 修订 | 待修复（演练后开 ticket） |
| F07 | P0 工具链 | S3 | 卸载入口不一致且 `rn self uninstall` 不完整：完整一键卸载只有 `get-rn.sh --uninstall`（删 rn/ship 链接+ENV_FILE+安装 home）；`rn self uninstall` 漏删 `~/.local/bin/ship`、ENV_FILE、安装 home（~/.client-platform/rn clone） | `self.ts` 遍历仅 ["rn"]、npm unlink rn+ship、markers；get-rn.sh `do_uninstall` 才删 ship/ENV_FILE/home | 用户按文档（cli-distribution.md）用 `rn self uninstall` 卸载会留下大量残余；两个入口行为不一致 | 演练后统一：A) 补全 `rn self uninstall`（+ship/+ENV_FILE/+安装 home）与 get-rn.sh --uninstall 对齐；B) 或文档把 `get-rn.sh --uninstall` 定为唯一卸载入口，`rn self uninstall` 降为只卸 CLI 自身 | 待修复 |
| F08 | P0 工具链 | S3 | 一键安装后"当前终端激活"步骤非一等公民，且安装目标路径选型错误：`curl \| bash` 跑在子 shell 无法改父 shell PATH（POSIX 约束）；平台把 `~/.local/bin`（新用户 PATH 里没有）当主路径 + env 文件 + 埋没的 source 提示；而 npm 全局 bin 对每个 Node 用户本来就在 PATH（pi/npm install -g 装完即用的秘密）。另：get-rn.sh 的 npm link 打进了安装时 nvm 选的版本（v24.21.0）而非用户活动版本（v24.19.0），其 bin 不在当前 PATH → npm-link 路径形同虚设 | pi 对比：`npm install -g` 装进 npm bin（已在 PATH）；get-rn.sh `link_bins` npm link 到子 shell 的 nvm use 版本；`command -v rn` 无自检 | 新用户装完当前终端不可用且提示不显眼；npm-link 路径因 nvm 版本不一致失效 | **升级方向（pi 模型）**：① 主安装路径 = 活动 Node 的 npm 全局 bin（`npm install -g` / `npm link`），对 Node 用户装完即用零 source；② 安装后自检 `command -v rn`：可解析 → 打印"已可用"；不可 → 才提示 source/重开终端；③ `~/.local/bin` 降为无 npm 环境的兜底；④ cli-distribution.md 把 `npm install -g` 列为主入口，get-rn.sh 为安装器 | 待修复 |
| F09 | P1 初始化（CLI UX） | S3 | 产品形态（工业壳）需要长命令 `rn init --starter topology-b --industrial`，且 `--starter topology-b` 与默认值重复；`--industrial` 是平台产品却要使用者手动记得加——新用户要么忘加得到降级壳，要么被长命令劝退，与"工业壳=平台产品"定位不符 | cli.ts help：starter 默认即 topology-b；industrial 为独立 flag；README 产品命令写全量长形式 | 产品默认体验缺失；新用户 onboarding 摩擦 | **已决策 D4（产品意图）**：`rn init` 默认 = 最小可跑完整链路（工业壳 + main 模块 + **OTA 原生适配注入** + host-resolver + 平台包链接），覆盖全角色；`rn init --pure`（干净壳）/ `--demo`（教学）为显式降档出口；分层命令，不再要求长 flag | 待修复 |
| F10 | P1 初始化（CLI 命名） | S3 | CLI flag 泄漏内部架构分类学：`--starter topology-b` 把 ADR-005 的"拓扑 B"内部代号直接暴露给用户（用户不懂"拓扑/A/B"，无法从名字推断）；且 `--starter`（布局）与 `--industrial`（壳内容）职责重叠——工业壳就是 topology-b 该有的壳，用户要理解"为什么 B 还要加 industrial" | cli.ts：`--starter topology-b|inline-main`（默认 topology-b）；`--industrial` 独立 flag；命名源自 ADR-005 拓扑分类 | flag 非语义化；新用户无法直觉理解；分类学耦合进公共命令面 | **已决策 D4**：分层命令替代——`rn init`=产品默认；`--pure`/`--demo` 显式降档；去掉 topology-b/industrial 暴露（或并入语义名） | 待修复 |
| F11 | P1 初始化（控制台输出） | S3 | init 控制台输出泄漏内部决策代号：`starter: topology-b (shell-plus-modules)`、`topology B: modules/main + shell App.tsx`、`industrial shell: ShellHost + ModuleRegistry + OTA gate applied (ADR-021)` —— 新用户看不懂 "topology B""ADR-021"是什么，也无法从中得知产物价值 | 本次 `rn init . --industrial` 实机输出 | 产物价值不可见；决策代号耦合公共输出 | 用户面向输出改语义化（如：`生成可运行的完整产品：壳 + 业务模块 + OTA 就绪` / `✅ 产品壳就绪 — 可 rn dev 开发 / ship 发布 / 设备 OTA`）；ADR 代号只留内部日志 | 待修复 |
| F12 | P1 初始化（输出） | S3 | init 后 Community CLI 的 "Run instructions" 打印 stage 目录路径（`cd …/rn0to1drill`），hoist 后该子目录不存在 → 打印路径失效，指向不存在的目录 | 本次实机：`ls -d rn0to1drill` 不存在；工程根为 hoist 后的 cwd | 用户照抄指令会 cd 到不存在的目录；输出与真实产物不符 | hoist 后平台应覆盖/重打印正确指令（指向真实工程根 cwd），并提示 `rn dev --android` 而非裸 npx react-native run-android | 待修复 |
| F13 | P1 初始化（D4 对齐 / 生命周期一致性） | S2 | init 产出一个"引用缺失物"的壳：`metro.config.js` require `.rn/metro/host-resolver.cjs`，但 init 不生成它（仅 `rn module register`/`rn dev` 才生成，`host-metro-config.ts:139`）→ 首次 `rn dev` 前 metro warn 降级、平台包解析未接线。**根因（系统级）**：声明（manifest/dev-session/module 清单）与派生产物（generated-registrations.ts + host-resolver.cjs）生命周期脱节——init 只产出"引用派生物的壳"，不产出派生物 | 实机：`.rn/metro/` 仅有 main.config.cjs；host-metro-config.ts 注释"Regenerate …"；旧工程有该文件因跑过 register | 与 D4"init=最小可跑完整产品"不符；用户 init 后直接 dev 遇 warn/解析缺失（难排查） | **系统级方案（声明→派生模型）**：① 派生产物 = 声明的纯函数（生成函数已存在：host-metro-config + renderModuleRegistry），统一为一个"声明→派生"再生成原语；② 触发点 = init 收尾 + `rn module register`（声明变更）+ `rn dev` 预检（兜底）；③ init 必生成，保证 init 产物即完整产品（D4）；④ metro 对缺失 resolver **fail-closed（报错）**而非 warn 降级（平台包解析是工业壳必须项）；⑤ 写入架构文档（声明→派生） | 待修复 |
| F14 | P2 模块注册表 | S4 | host-resolver.cjs 生成质量：`WATCH_FOLDERS` 中 `.pnpm` 条目重复 3 次（生成时代码未去重） | 实机 host-resolver.cjs 三个相同 `.pnpm` 行 | 功能无碍（watch 幂等），但派生物不干净 | 生成函数对 WATCH_FOLDERS 去重 | 待修复 |
| F15 | P3 开发环 | S3 | `rn dev` 行为与帮助文案不符且无日志流：帮助说"starts Metro … then keeps Metro running"，实际多 Metro 编排为 **detached**（终端立即返回，Metro 日志不流向终端）——开发者看不到 Metro/HMR/错误，dev 终端"无反应、非运行态" | 实机：`rn dev --modules main` 输出 "Multi-Metro running (detached)" 后返回；`sed` 改模块 dev 终端无任何输出 | detached 模式下开发闭环不可见；帮助文案误导 | 明确两种模式语义：`rn dev` 前台日志流（默认）vs `rn dev --detached`（后台）；或把日志写入文件并提示 tail；帮助文案与实际一致 | 待修复 |
| F16 | P3 开发环 | S2 | `rn dev` 复用已占用端口的 Metro **不校验工程身份**：8081 上残留的是旧工程（onboarding-industrial）的 Metro，新工程 `rn dev` 直接"already running"复用 → HMR/开发打到错误工程的内容，且无任何告警 | 实机：PID 30615 cwd=onboarding-industrial；`rn dev` 报 "Metro already running on :8081" | 多工程并行开发时静默连错服务器；开发内容错误难排查 | 复用前校验端口上 Metro 的工程身份（如 /status 或 bundle 指纹/工程根）；身份不符 → 报错并提示端口占用方（不静默复用） | 待修复 |

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

## 产品意图决策（rn init 定位，Q1–Q3 拍板）

- **决策 D4（2026-09-09）**：
  1. 目标用户 = **全角色**（业务应用团队 / 移动平台团队 / 运维——开发链路所有角色）。
  2. `rn init` 默认产物 = **最小可跑完整链路**：工业壳（ShellHost+ModuleRegistry+FailedUI）+ main 业务模块 + **OTA 原生适配注入（必须，RN 产品形态就要 OTA，init 就做）** + host-resolver + 平台包链接。init 完 → `rn dev` 能开发、`ship` 能发布、设备能 OTA。
  3. 显式降档出口：`rn init --pure`（干净壳）/ `--demo`（教学）；分层命令，不再要求长 flag。
  4. OTA 适配注入需参数化公钥（F02 方向）：`--pubkey-hex` 或读 keys/，不静默埋默认钥（生产 HITL）。
- 影响：F09/F10 修复方向已对齐 D4；P1 演练仍按现状（init 不含 OTA 注入，P4 显式注入）走，差异记为 finding。

## 密钥模型决策（F06 → 行业主流）

- **决策 D3（2026-09-09）**：弃用自研双钥（ADR-018），对齐**行业主流**——单签名钥 + HSM 托管 + 证书链（根 CA 签发）+ CRL/OCSP 吊销。理由：自研双钥未解决现有问题且无大厂实践；主流方案经大量实际项目验证。
- 原则：除非自研方案能证明比大厂实践更优，否则用主流方案。
- 范围（演练后开 ticket）：core 验签链（X.509+CRL/OCSP）· ship sign（HSM/PKCS#11/KMS 对接）· 模板（烘焙根 CA）· CP（吊销端点）· 设备端运行时（验链）· ADR-017/018 修订。
- 由此带来的新能力：业务签名钥可多次轮换且不动设备（证书链保证）；吊销走行业标准 CRL/OCSP；私钥不出 HSM。

## 演练过程追加（按 Phase 增量记录）

### P0 — 环境与密钥供应（进行中）

- 决策 D1：采用方案 A —— 走**现状**如实演示（`node -e` 生成 lab 密钥 → 手动烘焙新公钥），缺口记为 finding（F01/F02），演练后统一开图解决。
- 决策 D2：0→1 不使用机器上预置的历史密钥（`~/.client-platform/rn/lab-sign-key.pem`），改为**新生成** lab 密钥（`rn-0to1-drill-keys/`，工程外独立目录，保持 init 空目录）。
- 记录：新 lab 公钥 hex = `93431af7918536fd567876d2da79d0dfdadaaec56d13a577ad2a312a0322a258`（P4 烘焙用；私钥在 `rn-0to1-drill-keys/lab-sign-key.pem`，600）
- 事件（init 空目录拒）：P0 把 keys 放工程目录 → `rn init` 报 `cwd is not empty (keys)`。**结论**：init 空目录检查是正确安全设计（防覆盖，create-react-app/next 同款），**非平台缺陷**；真根因 = 平台无规范密钥位置（F01），密钥只能随手放。处理：keys 移工程外 `rn-0to1-drill-keys/`，工程目录恢复空。

_（后续阶段发现的问题在此追加，保持本表为主索引。）_
