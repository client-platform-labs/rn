# 设备端 OTA 运维手册

> 基于 ADR-016/017/018（已实现，G0 #202 / G1 #193 closed）。角色：**平台运维**（信任根 K1/K2、吊销、回滚）＋ **离线包运维**（包签名、promote/block）。本手册是「设备端验签链路」的可执行 runbook；服务端 / CP 发布侧流程见 `docs/runbooks/cp-oncall.md` 与 `roles-matrix.md`。
>
> 写作日期 2026-09-08 · ticket [#212](https://github.com/client-platform-labs/rn/issues/212)（Map G G8）· 真机证据 [`docs/hitl/map-g-device-ota-e2e-2026-09-07.md`](../../hitl/map-g-device-ota-e2e-2026-09-07.md)。

## 1. OTA 信任模型速览

三层 + 双公钥 + fail-closed（ADR-016/017/018）：

| 层 | 内容 | 特性 |
|----|------|------|
| **rn-core** | 纯验签 / 门禁判定（无 I/O） | 真 Ed25519 verify（`verifyEd25519Seal`）+ fail-closed 决策（`gateBundleLoad`），替换历史字符串比较 `sig === digest`（`packages/rn-core/src/ed25519-verify.ts` · `bundle-load-gate.ts`） |
| **shell-core** | 设备端 OTA 运行时客户端 | 拉取 / 下载 / 落盘 / 生效 / 回滚 / 崩溃环计数，GF/BF 共用（`packages/shell-core/src/ota-client.ts` · `pull-ota.ts` · `crash-loop.ts`） |
| **原生模板** | OTA 原生适配器（Android Kotlin） | 只持公钥 + 文件 I/O，不做签名数学（`packages/rn/templates/ota-android/`） |

信任模型要点：

- **Ed25519 fail-closed**：release 下只接受能被内置公钥验过的 `pem:ed25519:<base64>` 签名；`signature === digest` 的 digest-stub / HMAC 一律拒载（ADR-017，`bundle-load-gate.ts` 的 `missing`/`invalid` 分支）。
- **公钥烘焙在 APK**：K1（当前签名）+ K2（备用）随 APK 下发，不进 OTA 载荷（`ota-native.ts` `getOtaPublicKeys()`）。
- **信任边界（必须）**：执行验签的代码来自**随 APK 下发的受信 embedded/shell 包**，绝不来自待验的 OTA 包本身（防自提权，ADR-017）。
- **轮换能力**：双烘焙密钥支持 **1 次 OTA 应急轮换**；信任根耗尽 / 双失陷 = 全量重装（ADR-018）。
- 选型：@noble/ed25519（审计过的纯 JS，Hermes 可用，无 WebCrypto）；原生侧只持 key + 文件 I/O。

**一次性信任建立（为什么公钥烘焙、不进载荷）**：企业 sideload 无商店更新路径，新信任根不能经 OTA 自举（否则旧私钥持有者可签「新公钥」包自提权）。所以信任根（公钥 + 验签代码）在 **APK 构建时一次性钉死**，之后业务 JS 靠密码学密封演进，永不自我替换验签逻辑。运维上这条红线意味着：**换公钥 = 换 APK**（最多靠 K2 免重装一次，ADR-018），没有第三条路。

**设备端验签门禁链**（从 manifest 到执行，失败任一步即拒载）：

```text
pullOtaUpdate(启动)
  └─ fetchManifest → /v1/js-updates/check?module=&lane=   (CP)
       └─ verifySidecar（下载前）
            ├─ selector：business_module / channel 匹配 + fingerprint/能力门禁（gateJsCandidate）
            └─ gateBundleLoad → verifyEd25519Seal（@noble 真 Ed25519，K1/K2 逐验）
                 ├─ missing  → 无签名（release 拒载）
                 ├─ invalid  → 非 Ed25519（stub/HMAC 拒载）或验签失败（篡改包拒载）
                 └─ verified → 通过 → fetchUpdate → 下载后二次 verifySidecar → setInstalledUpdateId → installAndReload
```

验签发生**两次**：manifest 验一次、下载落盘后对实际 hbc 再验一次（`pull-ota.ts`）；任一次失败都不进入安装。fail-closed 的结果是设备**留在上一个良好包或基线**，而不是运行未验证代码。

## 2. 私钥管理（sign 侧）

### 私钥生成 / 注入 / 存储

签名私钥属于**平台运维**的信任根范畴（`roles-matrix.md` §3 职责边界：RN_CP_TOKEN / 签名私钥 / 信任根）。离线包运维**不持有私钥**，只负责用 `rn-delivery sign` 产生签名。

**生成**（一次性，进 HSM 前的可执行形态；HMAC 仅 dev 兜底）：

```bash
# 测试/实验室生成一对临时 Ed25519（rn-delivery 内建 helper；生产密钥由负责人离线生成并异地保管）
node -e "const s=require('node:crypto');const {privateKey,publicKey}=s.generateKeyPairSync('ed25519');console.log(privateKey.export({type:'pkcs8',format:'pem'}).toString());console.log(publicKey.export({type:'spki',format:'pem'}).toString())"
```

生产私钥的注入路径（`packages/rn-delivery/src/signature.ts` `resolvePemMaterial()`）：

- `RN_DELIVERY_SIGN_KEY_PEM`：内联 PEM（`\n` 转义还原）。
- `RN_DELIVERY_SIGN_KEY_FILE`：指向 PEM 文件（存在才读，文件不存在返回 undefined）。
- 优先级：PEM（Ed25519 / RSA）→ HMAC（`RN_DELIVERY_SIGN_KEY`）→ digest-stub（无密钥时兜底）。

**存储红线**（`roles-matrix.md` §3.3 升级路径 L2）：

- 私钥由人异地保管、不上机；age 加密后每日异地备份（与 ADR-014 冷重建备份同流程）。密钥类事件永远上人，不做自动化处置。
- 备份命令与 DR 同卷：`sqlite3 .backup` + 制品 tar + 签名私钥 age 加密异地（`roles-matrix.md` §3 日常任务）。

**K1 / K2 两把密钥都要能签**：轮换时服务端需用 **K2 私钥**签「K1 吊销」清单。生产环境 K1/K2 私钥应分开保管（至少分开备份），并记录 K1/K2 公钥的 32 字节 hex（就是烘焙进 APK 的值）。

### 禁止降级 stub

- **行为**：`signature.ts` 在「无 PEM 且无 HMAC key」时回退 `digest-stub`（`signature = digest`）；配了 `RN_DELIVERY_SIGN_KEY` 才走 HMAC。这两个都是 dev 路径。
- **后果（ADR-017 fail-closed）**：release 客户端 `gateBundleLoad` 对非 `pem:ed25519:` 签名返回 `invalid`（「digest-stub/HMAC not allowed in release」），包被**拒载**、设备回退上一个良好包。降级 = 线上签名大面积验证失败 → 按 §8 决策树转平台运维，先回滚、再重签。
- **门禁**：`rn-delivery validate` 对 js-update 要求 `candidate-signed`（release 缺签名直接 FAIL，`validate.ts`）；配 `RN_DELIVERY_SIGN_KEY` 时还会校验 HMAC 签名一致性。但**真实生产 gate 是设备端 fail-closed** —— validate 只是第一道。
- **正确姿势**：生产 sign 一律走 `RN_DELIVERY_SIGN_KEY_PEM` / `_FILE`（Ed25519）。若日志出现 `rn-delivery sign: PEM seal failed …; falling back`，说明 PEM 解析失败已静默降级——**必须当场修复，禁止带降级签名的包 release**。

### rn-delivery sign 真实产物

`rn-delivery sign`（`packages/rn-delivery/src/sign.ts`，仅 release-profile 候选可签）对 `release_id : artifact_kind : digest` 这段 utf8 负载签名，产出：

```
signature = "pem:ed25519:<base64>"   # over `${release_id}:${artifact_kind}:${digest}`
```

- 产物写入 last-candidate（`stage: "sign"`）；js-update 还会重写 sidecar `packages/rn-delivery/src/js-update-sidecar.ts`（`signature` 进 `.rn/delivery/updates/<module>/<update_id>.json`）。
- 设备端 `verifyEd25519Seal` 按**同一 payload 串**重建消息并逐公钥试验（K1 → K2），任一击中即通过（`ed25519-verify.ts`）。所以 `release_id` / `artifact_kind` / `digest` 三字段在 sign 与 verify 两侧必须**逐字节一致**；不一致即使密钥正确也会 `verify REJECTED`（篡改包路径，§8）。
- 验证命令：`rn-delivery validate`（`candidate-signed` 检查）或设备侧 `verifySidecar ok:true`（见 §7 真机证据）。

## 3. 设备端验签运维

### 公钥烘焙

- **K1/K2（32 字节 hex 各一）由平台运维提供**，经原生侧烘焙进 APK（`packages/rn/templates/ota-android/` 的 `getOtaPublicKeys()`：res/raw 或 BuildConfig；模板里当前是 `TODO(G0)` 占位，生产 APK 必须回填真实公钥）。
- 原生 `@ReactMethod` 是异步的：Kotlin 侧用 `getOtaPublicKeysAsync` 返回 `Arguments.createArray().pushString(...)`，**绝不用 `arrayOf()`**——它过 RN 桥变成 `WritableNativeArray`，JS 里 `Array.isArray()===false`，公钥会丢、验签 fail-closed（真机实证过的坑，`ota-android/README.md`）。JS 侧一律 `Array.from()` 归一化（`ReleaseOtaBoot.tsx` `refreshPublicKeys`，并过滤非 64 位 hex）。
- 启动时原生公钥取一次进 JS 缓存，adapter 的同步 `getOtaPublicKeys()` 读缓存（`greenfield-ota/ReleaseOtaBoot.tsx`）。
- **操作检查单**：换 APK 前确认（1）K1/K2 hex 与平台运维签发记录一致；（2）release APK 内无 dev 公钥 / 测试公钥残留；（3）烘焙公钥从未经过 OTA 载荷下发（信任边界）。

### 验签失败排查

设备端验签在 `verifySidecar` → `gateBundleLoad` → `verifyEd25519Seal` 链上（`shell-core/src/ota-client.ts` · `rn-core/src/bundle-load-gate.ts`）。失败即 `pullOtaUpdate` 返回 `failed`，**永不进入 fetch**（fail-closed，`pull-ota.ts`）。

| 症状 | 根因 | 处置 |
|------|------|------|
| `verify REJECTED … keys=0`（公钥数组为空） | 公钥没烘焙 / 桥数组丢失（`arrayOf()`） | 平台运维核对 APK 内公钥；修复原生适配器，见 §3 公钥烘焙。真机实证过（e2e 报告「公钥为空时 verify REJECTED … keys=0，拒绝加载」） |
| `Ed25519 signature verification failed for update_id=…` | 篡改包（digest mismatch）或签名与公钥不匹配 | 服务端重算 digest 并核对 sign 的 `release_id:artifact_kind:digest` 三字段；包被改过就重出 |
| `non-Ed25519 signature refused … (digest-stub/HMAC not allowed in release)` | 用错 sign 模式（没配 PEM，落成 stub/HMAC） | 重签为 `pem:ed25519:`（§2）；禁止带降级签名 release |
| `unsigned package refused …`（signature missing） | sign 阶段缺失签名 | 跑 `rn-delivery sign` 后重 validate / release |
| `missing host_context` / `missing candidate` | sidecar 不完整（fingerprint 缺字段会在设备 gate 崩） | 由 rn-delivery 产出，勿手搓 sidecar（`ota-android/README.md` 第 6 条） |

### 信任边界

- **验签代码必须来自 APK 内嵌**（rn-core/shell-core 随 embedded 包下发），**绝不用 OTA 载荷里的 JS 去验 OTA 包**（ADR-017 防自提权）。核对：设备上验签入口 `gateBundleLoad` 编译进基线 bundle，而不是从 `candidate.url` 下载的 index.hbc 里。
- **公钥必须来自 native（烘焙）**：`getOtaPublicKeys()` 读 APK 资源，绝不读 manifest / sidecar / OTA 载荷里的「公钥字段」。可疑的「OTA 自举公钥」实现一律视为失陷（ADR-018：否则旧私钥持有者可签「新公钥」包自提权）。
- dev 路径才允许 `allowUnsignedInDev`（`bundle-load-gate.ts`）；release 强制 fail-closed（`G-DEV≠REL` 的密码学版本，`docs/handbook/architecture/index.md` §7.2）。

## 4. Key 轮换操作（K1 → K2）

### 应急轮换流程（checklist）

场景：**K1 疑似失陷**（验签失败风暴 / 私钥泄露事件）。目标：1 次免重装轮换，设备用烘焙的 K2 验证「K1 吊销」，攻击者无 K2 私钥伪造不了（ADR-018）。

```text
[ ] 1. 平台运维判定 K1 疑失陷（§8 决策树：验签失败风暴 → K1 疑失陷）
[ ] 2. 用 K2 私钥签发「K1 吊销」清单（清单声明 K1 公钥 hex + 吊销时间 + K2 公钥），
      并以 K2 签名（pem:ed25519: over 清单内容）下发到 CP / 分发面
[ ] 3. 服务端签名切换：后续 js-update 全部用 K2 私钥签（RN_DELIVERY_SIGN_KEY_PEM/_FILE 换 K2 PEM）
[ ] 4. 设备用烘焙 K2 验吊销 → 拒绝 K1 新签名（K1 从「验签」退为「仅验历史或吊销」）
[ ] 5. 旧包：K1 签的历史包只允许回滚/兜底，不得作为新正常包 promote
[ ] 6. 交接壳运维：K2 生效后重打 APK（新信任根只进 APK）+ MDM/sideload 重分发（roles-matrix §6 S4）
[ ] 7. 双失陷 / K2 也用完 → 跳过本流程直接 §4.3 全量重装（需产品负责人决策）
```

### 轮换窗口双公钥

- 轮换窗口期内 **K1 吊销前，K2 签名也被接受**（`verifyEd25519Seal` 逐公钥试验，`bundle-load-gate.ts` 传 K1+K2 全量）：设备能平滑过渡，不要求一次到位。
- K1 吊销**生效后**：新包必须 K2 签；K1 签只验历史或吊销语义。
- 吊销 / 轮换状态机要求写进 G8 runbook（ADR-018 措辞：「**双烘焙密钥支持 1 次 OTA 应急轮换；信任根耗尽/双失陷 = 全量重装**」）。当前实现：吊销清单的**下发与设备端校验协议未落代码**（见「已实现 vs 待实现」）。

### 双失陷全量重装

- K1/K2 都失陷、或信任根耗尽 → 新信任根**只能烘焙进 APK**（ADR-018），经重打 + 重分发（MDM/sideload）下发，**绝不走 OTA 自举**。
- 流程：平台运维换新一对公钥 → 重打 APK → 全量重装 → 新 APK 内烘焙新 K1'/K2'。需产品负责人决策（`roles-matrix.md` §3.3 升级路径 L3）。
- 这同时意味着：**不要滥用双密钥**——一次免重装轮换是稀缺资源，K1 泄露要尽早按应急轮换流程走，避免拖到双失陷。

### 已实现 vs 待实现（TODO(G7)）

- **已实现（平台侧）**：双公钥烘焙契约（`ota-native.ts`）；`verifyEd25519Seal` 支持多公钥逐验；`bundle-load-gate.ts` fail-closed。
- **TODO(G7)**：K1 吊销清单的签发/下发/设备端校验协议、吊销状态机落地（模板 `ota-android/README.md` HITL 待办：双公钥 K1/K2 + 「K1 吊销」真机验证未做；轮换目前是文档级操作指引）。

## 5. 回滚操作

### 包级回滚（CP / registry）

坏 JS 包在服务端层面**停止投递**即可让设备不再拉到它；已装设备走设备级回滚（§5.2）。

- **block**：`POST /v1/block {"digest":"<sha256>","reason":"<原因>"}`（`serve.ts`，写路由需 `RN_CP_TOKEN` + `RN_CP_ROLE=admin`）——把该 digest 移出 staging/production、进 `registry.blocked`（`candidate-store.ts` `blockCandidateInRegistry`）。
- **kill**：`POST /v1/kill {"business_module":"<mod>","update_ids":["<id>"],"reason":"oncall"}`——按 module 隔离特定 update_id（`candidate-store.ts` `killModuleUpdates`）；`GET /v1/kills` 核对 `blocked_update_ids` 不误伤兄弟模块。
- **pause**：`POST /v1/pause {"business_module":"<mod>","reason":"…"}` 暂停该模块 promote；双 pause 返回 400；`resume` 需 admin（viewer → 403）。
- **promote 上一良好 digest**：把上一良好 digest 重新 `rn-delivery promote --digest <sha256>`（staging→production，`promote.ts`），让 `/v1/js-updates/check` 回指它。
- 详见 `docs/runbooks/cp-oncall.md`（kill/pause、P7–P10）与 `roles-matrix.md` §2.4。

### 设备级回滚（shell-core）

- **崩溃环回滚**：`crash-loop.ts` —— `shouldRollbackOnCrashLoop(consecutiveFailures, max=3)`，连续失败 ≥ `DEFAULT_CRASH_LOOP_MAX` 时设备调 `rollbackToEmbeddedBaseline` 回基线（`ota-client.ts`）。原生侧持久化启动计数：每次启动 `recordStartupFailure()+1`，健康启动 `resetStartupFailures()`（`ota-native.ts` 契约；`ReleaseOtaBoot.tsx` 启动先查崩溃环再拉更新）。
- **显式回基线**：`rollbackToEmbeddedBaseline(moduleId)` = `clearActiveBundlePathForModule` + `setRootModuleId` + `reload`（`ota-client.ts`，Android-only）。
- **回滚后验证**：设备回到基线/上一良好包后，确认（1）启动正常、崩溃计数已 reset；（2）`GET /v1/js-updates/check` 返回的 digest 是上一良好 digest（若 block 未生效仍指向坏包，需先修 CP）；（3）验签仍过（坏包若只是行为问题、签名合法，block/kill 即可；若是签名问题，按 §8 走）。

**回滚策略速查**：

| 层级 | 机制 | 粒度 | 谁执行 |
|------|------|------|--------|
| 包级 | `/v1/block` / `/v1/kill` / `/v1/pause` / re-promote | digest / update_id / module | 离线包运维（CP 写路由） |
| 设备级 | 崩溃环（≥3 次失败）→ `rollbackToEmbeddedBaseline` | module / 设备 | 设备自动（shell-core + 原生） |
| 设备级 | 显式 `rollbackToEmbeddedBaseline` | module | 壳运维 / 平台运维（宿主侧） |

**顺序铁律**：先包级（停投递、让 check 不再返回坏 digest），再设备级（已装设备自然回滚 / 人工回基线）；先消灭「新装坏包」的来源，再处理存量。崩溃环回滚是设备侧最后一道兜底——它依赖原生启动计数实现，若宿主没实现 `recordStartupFailure`/`resetStartupFailures`（optional），崩溃环回滚不会触发，此时人工回基线成为唯一手段。

## 6. 重拉/重载循环（已知问题 + 临时规避）

**这是真机 e2e 发现的真实平台级教训**（`docs/hitl/map-g-device-ota-e2e-2026-09-07.md`「真实发现（G7/productization 待办）」），如实记录：

- **现象**：安装 reload 后 app 回到基线（root 模块 active path 未持久化），且 `update_id` 跨进程重置 → 每启动**重复拉同一个更新**（cp 访问日志：设备反复 `GET /v1/js-updates/check` + `GET /v1/artifacts/<digest>`）。
- **根因**：reference host 的模块路径解析 / update_id 持久化缺失，非 RN 平台缺陷。
- **平台侧的解法（已实现）**：`pull-ota.ts` 的「skip-if-installed」——`setInstalledUpdateId` 在 **reload 之前**持久化（reload 杀进程，ADR-014），重启时 `getInstalledUpdateId` 命中即返回 `already_installed`、跳过拉包；`pull-ota.test.ts` 已验证「已装则 0 次 fetch/install」「先持久化后 reload」。
- **运维视角当前会遇到什么**：若宿主适配器**没实现** `getInstalledUpdateId`/`setInstalledUpdateId`（optional 方法，`ota-native.ts` 标 `?`），设备会重拉同一包——表现为 CP 访问日志里同一 digest 反复被 check/下载。
- **临时规避**：（1）上线前用 `ReleaseOtaBoot.tsx` 产品化模板（它自带 installed_update_id 持久化 + 崩溃环 + 跳过已装 digest 的契约）；（2）宿主适配器实现 native SharedPreferences 持久化两个方法；（3）观察 cp 访问日志，若同一 digest 高频重拉，优先怀疑宿主没持久化 update_id，而非 CP 问题。
- **TODO(G7)**：greenfield 模板里把「installed update_id 持久化 + crash-loop 预算 + 跳过已安装 digest」定义为正确行为（模板 `ota-android/README.md` HITL 待办含崩溃环真机验证）。

## 7. 真机 e2e 证据

2026-09-07，vivo V2425A（`10CEC62C7R000E3`），release 模式，宿主 `~/code/tiangong-host`。完整链路跑通：**设备端用烘焙公钥真验 `pem:ed25519:` 签名 → fail-closed → 拉包安装**（`docs/hitl/map-g-device-ota-e2e-2026-09-07.md`）。

- **LIVE VERIFY: PASS**：`createOtaClient` 对 cp-serve 实时服务的 desk 更新（digest `2c0a3b7c8cf8…`，1.58MB hbc）用烘焙公钥 `3c728c…` 验签通过（`verifySidecar ok:true`）。
- 设备端日志链：`verify OK signature=pem:ed25519:…` → `writeFileBase64 ota/desk/staged/index.hbc bytes=2212200`（CP 下载签名包）→ 下载后二次验签 OK → `setActiveBundlePathForModule`（安装）→ `reload`。
- **fail-closed 实证**：公钥为空时 `verify REJECTED … keys=0`，拒绝加载。
- **平台教训两条**：（1）Kotlin `arrayOf()` 过桥 `Array.isArray()===false` → 公钥丢失，必须 `Arguments.createArray()` 或 JS 侧 `Array.from()`（已修）；（2）reference host 加载预构建基线 bundle，shell 源码编辑不生效，需重跑 `node scripts/embed-baseline.mjs --module desk` 正式基线管线。
- 复现命令：`node /tmp/mapg-ota-key/resign-desk.mjs` → `rn-delivery cp-serve --port 18899` → `node /tmp/mapg-ota-key/verify-live.mjs`（→ LIVE VERIFY: PASS）。

## 8. 故障排查决策树

设备端失败 → 查什么 → 谁负责（角色引用 `roles-matrix.md`）。

```text
设备侧报验签失败 / 不拉包 / 回基线
│
├─ 1) 先看是「服务端没给」还是「设备端拒收」
│    cp 访问日志有无 GET /v1/js-updates/check + /v1/artifacts/<digest>
│    ├─ 无请求        → 网络/隧道（adb reverse）/认证门/宿主 OTA 触发逻辑
│    │                  → 壳运维（宿主构建与安装，roles-matrix §1）+ 离线包运维（确认包在 production lane）
│    └─ 有请求被拒     → 继续 2)
│
├─ 2) 设备日志 verify 结果
│    ├─ verify REJECTED … keys=0        → 公钥没烘焙/桥数组丢失 → 平台运维（§3.1）
│    ├─ verify REJECTED（keys 非空）     → 篡改包 / 签名上下文不匹配 → 平台运维+离线包运维重签（§2）
│    ├─ refused (digest-stub/HMAC)      → 用错 sign 模式 → 离线包运维重签 pem:ed25519（§2 禁止降级 stub）
│    └─ verify OK 但没装上              → 进 3)
│
├─ 3) 装上了但行为异常 / 回基线
│    ├─ 崩溃环回滚（连续失败≥3）         → 看 crash 信号与日志 → 离线包运维走 §5 回滚坏包
│    ├─ 重拉/重载循环（同 digest 反复）  → 宿主没持久化 installed update_id → 壳运维核对适配器（§6）
│    └─ 验签失败风暴（大面积 REJECTED）  → 进 4)
│
└─ 4) 验签失败风暴 / K1 疑失陷
     ├─ K1 疑失陷 → 平台运维走 ADR-018 应急轮换（§4.1：K2 签「K1 吊销」+ 切 K2 签名）
     ├─ K2 也失陷 → 全量重装（§4.3，产品负责人决策）
     └─ 事件全程：离线包运维停 promote / 回滚上一良好包（§5），平台运维盯 cp-audit.log 与 /v1/metrics
```

**角色交接速查**（`roles-matrix.md` §6）：

| 场景 | 主责 | 交接 |
|------|------|------|
| 宿主 APK 构建/安装/装包台 | 壳运维（§1） | 产物+digest 交平台运维 |
| 单 module JS 钢线 / promote | 离线包运维（§2） | 灰度 SLI 交平台运维 |
| CP 起停 / 注册库备份 / 信任根 K1/K2 / 吊销 | 平台运维（§3） | K1 吊销说明交壳运维重打 APK |
| 验签失败风暴 / K1 疑失陷 | 平台运维（§3.3） | 离线包运维配合停 promote + 回滚 |

**提醒**：所有写路由（promote/block/kill/pause/resume/rollout）走 `rn-delivery` + CP，绝不用 `rn` 命令行发布（ADR-008 · `roles-matrix.md` 原则红线）。设备验签 fail-closed 是最后一道门，**先保证 CP 侧正确投递，再谈设备端排查**。

---

## 附 · 术语与来源索引

| 术语 | 含义 | 出处 |
|------|------|------|
| `pem:ed25519:<base64>` | rn-delivery 对 `${release_id}:${artifact_kind}:${digest}` 的 Ed25519 签名 seal 格式 | `rn-delivery/src/signature.ts` |
| K1 / K2 | 烘焙进 APK 的两把 Ed25519 公钥：K1 当前签名 + K2 备用（ADR-018） | `rn-core/src/ed25519-verify.ts` · ADR-018 |
| `verifySidecar` | 设备端一次验签：`gateBundleLoad` → `verifyEd25519Seal`，失败即拒载 | `shell-core/src/ota-client.ts` |
| `pullOtaUpdate` | 启动编排：skip-if-installed → verify → fetch → 先持久化 update_id 再 reload | `shell-core/src/pull-ota.ts` |
| `rollbackToEmbeddedBaseline` | 设备级回基线：清 active path + 设 root module + reload | `shell-core/src/ota-client.ts` |
| 崩溃环预算 | 连续启动失败 ≥ `DEFAULT_CRASH_LOOP_MAX`(3) → 回基线 | `shell-core/src/crash-loop.ts` |

来源索引：

- ADR-016 `docs/adr/016-on-device-ota-sdk.md` · ADR-017 `docs/adr/017-device-ota-trust-model.md` · ADR-018 `docs/adr/018-dual-key-rotation.md`。
- 平台实现：`packages/rn-core/src/ed25519-verify.ts` · `bundle-load-gate.ts`；`packages/shell-core/src/{ota-client,ota-native,crash-loop,pull-ota}.ts`；`packages/rn-delivery/src/{signature,sign,serve,validate,promote,candidate-store}.ts`；`packages/rn/templates/{ota-android,greenfield-ota}/`。
- 运维角色：`docs/handbook/operations/roles-matrix.md` · `docs/runbooks/cp-oncall.md` · `docs/runbooks/distribution-ops-a.md`（§6 验签/信任告警）。
- 真机证据：`docs/hitl/map-g-device-ota-e2e-2026-09-07.md`。
- 架构：`docs/handbook/architecture/index.md` §7 设备端信任模型。


