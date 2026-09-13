# 设备端验收 Runbook（Map I / #268）

> 目的：让**不是本改动作者**的工程师，在约 15–20 分钟内跑完本次 8 个接缝改动所**无法在 AFK 环境验证**的那一段真机验收，并能自己判读出结论。
> 纪律：本仓 **done = 验收通过**。本文档只提供可执行步骤与判读；**未跑过的步骤不得声称已通过**。
> 关联：[#268](https://github.com/client-platform-labs/rn/issues/268) · [device-gate-plan.md](./device-gate-plan.md) · 已自动化探针 `scripts/e2e/chain-11-ota-trust.sh`

---

## 0. 前置：准备 DUT（设备被测对象）—— 这一步不能省

### 0.1 为什么不能用 `~/code/tiangong-host` 当 DUT

**结论：不能。** 本次要验的两条安全路径，在 legacy 参考宿主上**都不存在**（已逐项核对源码）：

| 需要的面 | `~/code/tiangong-host` 实况 | 后果 |
|---|---|---|
| `recordStartupFailure` / `resetStartupFailures` | `OtaModule.kt` 中 **0 处** | 崩溃环计数无法产生 → leg A 无法成立 |
| `getInstalledUpdateId` / `setInstalledUpdateId` | `OtaModule.kt` 中 **0 处** | 已安装更新不持久化 → 每次启动重拉同一更新 |
| 壳内的 `/v1/crl` 拉取与验签 | `shell/` 中**无** `v1/crl` / `fetchRevocations` / `verifyRevocationSeal` | leg B 无从触发 |
| `pullOtaUpdate` 契约 | 调用的是**宿主本地** `./ota/pullOtaUpdate`，签名为 `pullOtaUpdate(moduleId, {lane})` | 与 shell-core 现行 `pullOtaUpdate(client, native, moduleId, opts)` 已不一致（#257 前的旧拷贝） |

在这个宿主上跑 leg A/B 会得到**假绿**："没有安装"是因为**根本没接线**，而不是因为 fail-closed。

### 0.2 生成 DUT（新工程，带原生 OTA 适配器 + 烘焙信任根）

```bash
# 1) 生成信任根（ADR-024 stage-3 默认即证书链）
KEYS=$HOME/.client-platform/keys
ship keygen --dir "$KEYS"
# 预期输出（JSON）：action=keygen-cert · root_ca_public_key_hex=<64hex> · leaf_cert=… · root_ca_cert=…
#   记下 root_ca_public_key_hex —— 它就是要烘焙进设备的信任根
#   ⚠️ 该输出里的 next 提示写着 `apply-ota --rca-pubkey-hex …` —— 那是个**不存在的命令**（见 #265），
#      正确命令是本节的 `rn init --rca-pubkey-hex`。

# 2) 生成 DUT 工程（--rca-pubkey-hex 会安装原生适配器并烘焙信任根，ADX-016/024）
DUT=$HOME/code/rn-ota-acceptance
rn init --rca-pubkey-hex <root_ca_public_key_hex> "$DUT"
# 预期：输出"可运行的完整产品就绪：壳 + 业务模块 + OTA"；
#       且 $DUT/android/**/ota/{OtaModule.kt,OtaPackage.kt} 存在、MainApplication.kt 已注册

# 3) 构建 release APK（RCA/dev 构建均可，但要确保 __DEV__=false 才会走 OTA 流程）
( cd "$DUT/android" && ./gradlew assembleRelease )
# 预期：app/build/outputs/apk/release/app-release.apk
```

**校验 0.2 是否成立**（不通过就别往下走）：

```bash
KT=$(find "$DUT/android" -path '*ota*' -name OtaModule.kt | head -1)
grep -q recordStartupFailure "$KT" && grep -q getOtaPublicKeys "$KT" && echo "native surface OK"
grep -rq 'v1/crl' "$DUT/shell" && echo "CRL path OK"
grep -q "pushString(\"<root_ca_public_key_hex>\")" "$KT" && echo "trust root baked OK"
# 若第三条不匹配：适配器可能以 getOtaPublicKeysAsync/数组形式烘焙 —— 打开 $KT 人工确认
# 里面**没有**模板默认钥（模板默认值是错误信任根，绝不能留）。
```

### 0.3 ⚠️ 三种签名模式不能混淆（本次最容易被绊倒的一处）

设备侧有两个**独立**的信任检查，用的键**不同**（`shell-core/release-boot.ts`）：

| 检查 | 验签用的键 | 因此要用哪把私钥签 |
|---|---|---|
| **JS 更新 seal** （manifest 里的签名） | leaf → 由烘焙的 RCA 验**证书链** | **leaf** 私钥（`RN_DELIVERY_LEAF_CERT` 等） |
| **吊销清单 CRL seal** | 直接对 `native.getOtaPublicKeys()`（cert 模式 = **烘焙的 RCA**） | **RCA** 私钥 |

控制面自己也把这一点喊出来了（实测输出，未签名 CRL 时）：

```text
[cp] /v1/crl served UNSIGNED (no CRL signing key) — devices will reject it (fail-closed).
Configure RN_DELIVERY_SIGN_KEY_PEM/FILE or RN_DELIVERY_HSM_SIGN_CMD.
IMPORTANT (ADR-024 cert mode): the CRL must be signed with the RCA private key baked into the APK
(--rca-pubkey-hex); signing with the leaf key instead makes devices reject every CRL.
```

另一个陷阱：`scripts/e2e/lib.sh` 会**全局导出** `RN_DELIVERY_LEGACY_SIGN=1`（因为 legacy 参考宿主只烘焙了单把 lab 钥 `4a4b3fc6…`）。DUT 烘焙的是 RCA，若沿用 legacy 单钥路径签 JS 更新，seal 验不过 → 永远装不上 → leg B 的差分控制失败、只能 SKIP。对 DUT 必须走证书链。

```bash
# DUT 路径（证书链）：
unset RN_DELIVERY_LEGACY_SIGN
export RN_DELIVERY_SIGN_KEY_PEM="$KEYS/lab-sign-key.key"      # leaf 私钥（以 keygen 实际输出名为准）
export RN_DELIVERY_LEAF_CERT="$KEYS/lab-sign-key.leaf.crt"
export RN_DELIVERY_LEAF_PUBKEY_HEX=<leaf pubkey hex>
# CRL 另需用 RCA 私钥签（见 §1）；变量名以 packages/ship/src/sign.ts 与 CP 的提示为准。
```

---

## 1. 起控制面，并确认 `/v1/crl` 是**已签名**的

leg B 的前提是 CP 提供签名 CRL（#253 起成立）。没有它，leg B 无意义 —— 而且 tamper stub 会**拒绝启动**（不会伪造篡改信号）。

```bash
bash scripts/setup-local-distribution-server.sh          # 起 CP(:4040) +（可选）Caddy(:80)
curl -sf http://127.0.0.1:4040/health && echo "CP up"

# 形状检查：必须同时有 seal 与 payload（未签名体只有 revoked，没有 seal）
curl -s -H "Authorization: Bearer ${RN_CP_TOKEN:-dev}" http://127.0.0.1:4040/v1/crl | jq '{has_seal:(.seal|type), has_payload:(.payload|type), revoked:(.revoked|length)}'
# 预期：has_seal="string" · has_payload="string"
# 若 has_seal=null → 未配 CRL 签名钥。CP 会在访问日志里明说原因：
#   grep -F 'served UNSIGNED' "$CP_LOG"
# 按 §0.3：CRL 必需用**烘焙进 APK 的 RCA 私钥**签；用 leaf 签会让设备拒掉每一份 CRL。
# 在签名钥配好之前，不要往 leg B 走 —— 否则 leg B 只能 SKIP（这是设计如此，不是缺陷）。
```

CP 访问日志（leg A/B 的**唯一可信观察通道**，因为壳渲染基线时是静默的）：

```bash
CP_LOG=${TIANGONG_HOST:-$HOME/code/tiangong-host}/.rn/distribution-lab/logs/cp-serve.log
tail -5 "$CP_LOG"        # 预期含形如 `[cp-access] GET /v1/crl`
```

---

## 2. 打通设备 → CP

设备侧看到的 `127.0.0.1:4040` 由 adb reverse 映射到宿主机 CP：

```bash
SERIAL=$(adb devices | awk 'NR==2 && $2=="device"{print $1}')
adb -s "$SERIAL" reverse tcp:4040 tcp:4040
adb -s "$SERIAL" shell "curl -sf -m 3 http://127.0.0.1:4040/health"   # 预期输出 {"ok":true,...}
```
> 设备无 `curl` 时用 `adb shell run-as`/应用内探针替代；chain-09 已有同样用法可参照。

---

## 3. 造一个 **production lane** 的 pending 更新（leg B 的差分控制前提）

壳的 boot 拉的是 **`lane=production`**（`shell-core/release-boot.ts`）。staging 里的候选**不算**。

```bash
unset RN_DELIVERY_LEGACY_SIGN
# 用 DUT 的模块 id（默认 main；`rn init` 后见 $DUT/.rn/dev-session.jsonc 的 modules）
ship update  --module main --profile release        # 产出 .rn/ota-build/main/index.bundle
ship release --module main                          # 进 staging（按 CLI 实际动词为准）
ship promote --digest <上一步 digest>                # staging → production
curl -s -H "Authorization: Bearer dev" "http://127.0.0.1:4040/v1/js-updates?module=main&lane=production" | jq '.candidates|length'
# 预期 ≥1 —— chain-11 把这个数字当作前置条件；为 0 时它会 SKIP 而不是假绿
```

---

## 4. 跑探针

```bash
E2E_DUT_PROJECT=$DUT bash scripts/e2e/chain-11-ota-trust.sh
```
`chain-11` 跑三段：
- **C（静态，无设备也跑）**：两宿主 adapter 的差异仅限宿主专属参数、且都不内联协议/序列。
- **B（差分）**：先验"CRL 正常 → 更新被安装（pid 变化）"（**控制腿**），再把设备的 4040 反代到 `cp-crl-tamper-stub --mode tampered`，断言 (a) 设备**确实请求了** `/v1/crl`、(b) **未安装**、(c) 应用仍在基线可运行。
- **A（崩溃环）**：注入 4 次未完成启动（阈值 3）后，断言回滚启动窗口内 CP **没有** `/v1/js-updates/check` 请求。

退出码遵循本仓约定：**0=PASS · 1=FAIL · 2=SKIP**（SKIP ≠ PASS，`run-all.sh` 会把它记为 SKIP）。

### 4.1 失败判读

| 现象 | 含义 | 处置 |
|---|---|---|
| 11.B1 报 `未观察到安装` 并 SKIP | **差分控制未成立** —— 不能据此判断 fail-closed | 查：是否 release 构建（`__DEV__=false`）、cpBaseUrl 是否可达、是否用 leaf 签名（§0.3）、production lane 是否有 pending |
| 11.B2 `设备未请求 /v1/crl` | "没安装"是因为**根本没尝试**（如 base URL 未配置），不是 fail-closed | 先修可达性；这条断言存在就是为了挡住这种假绿 |
| 11.B2 `被篡改的 CRL 仍安装了更新` | **真回归**：fail-closed 失效 | 按平台 bug 处理，挡合并；对照 `release-boot.ts` 的 `CRL unsigned` / `CRL seal invalid` 三个 throw |
| 11.A `回滚启动仍请求了 manifest` | 两种可能，**必须区分** | 见下表 |

`11.A` 的两种可能（runbook 要求人工区分，chain 无法自辨）：

| 可能 | 判据 | 处置 |
|---|---|---|
| **注入未命中**（force-stop 落在 boot 窗口之外，计数没到 3） | 把注入次数从 4 调到 6–8 重跑；或改用**自崩溃 bundle**（`.rn/ota-build/bad.bundle`）让每次启动必然失败 | 环境/手法问题，**不是**平台 bug |
| **未回滚**（计数到了却没回滚） | 注入次数加大后**仍然**请求 manifest | **真回归**，挡合并（对照 `crash-loop.ts` + `recordStartupFailure`） |

> 更稳的做法（推荐优先）：用"会崩的 bundle"当 production 更新，启动 3 次让它自己死，再第 4 次启动验回滚。这样不依赖 `force-stop` 的时序，判读也不含糊。

---

## 5. 回归网：本次 8 个接缝改动不许打破既有真机链

```bash
bash scripts/e2e/run-all.sh          # 10 条链；全量
bash scripts/e2e/run-all.sh 3 5 9    # 或只跑高价值三条（壳加载/业务全生命周期/后台）
```
判读沿用 [device-gate-plan.md §11](./device-gate-plan.md)：先看 `report-*.md`，再 `sed 's/\x1b\[[0-9;]*m//g' /tmp/e2e-out/chain-NN.log | grep -E "✗|⊘"`。
注意：既有链跑的是 **legacy 参考宿主**（`com.tiangong.host`），与 §0 的 DUT 是**两个不同的被测对象** —— 前者验回归，后者验新的安全路径。

---

## 6. 覆盖 / 不覆盖（明确边界）

**覆盖**：崩溃环回滚（A）· 篡改 CRL 拒载（B）· 两宿主请求集差异（C）· 既有 10 链回归（E）· init→设备 OTA（0.2 已在准备 DUT 时顺带验到：带钥 init 能产出可构建、带原生适配器的工程）。

**不覆盖**（不要误以为验了）：
- iOS / HarmonyOS（ADR-012 决策边界）。
- HSM 实际对接（`RN_DELIVERY_HSM_SIGN_CMD` 契约在，硬件由外部提供）。
- 真实 CA / 多租户隔离（企业级 backlog，见 device-gate-plan §12）。
- 商店分发路径（ADR-012：可执行 OTA 仅企业内部分发）。

---

## 7. 首次真机执行的实测记录（2026-09-13）

在 vivo V2425A / Android 16 (SDK 36) 上按本 runbook 实跑，得到的事实（可直接引用，含反例）：

| 步骤 | 实测 |
|---|---|
| `rn init --rca-pubkey-hex`（生成 DUT） | **171s**；输出确认 `bake root-CA → OtaModule.getOtaPublicKeys`、拷入两个 Kotlin 文件、patch `MainApplication.kt` |
| `./gradlew assembleRelease`（release 必须，debug 的 `__DEV__=true` 会跳过 OTA） | **62s**（`~/.gradle/caches` 已热，4.6GB）；APK 54MB |
| `safe_install`（含 vivo 弹窗） | **14s** |
| 一次完整启动对 CP 的请求顺序 | **`GET /v1/crl` → `GET /v1/js-updates/check`** —— 与 `pull-ota.ts` 一致（吊销先于 manifest，fail-closed 顺序） |

### 7.1 ⚠️ 崩溃环回滚是**单向陷阱**（首次真机发现）

`shell-core/release-boot.ts` 的回滚分支：
```ts
if (shouldRollbackOnCrashLoop(failCount)) {
  try { await client.rollbackToEmbeddedBaseline(moduleId); } catch {}
  return { phase: "baseline", skippedReason: "crash_loop_rollback" };  // ← 没有 resetStartupFailures
}
```
而 `resetStartupFailures` 位于 `pullOtaUpdate` **之后**。原生 `recordStartupFailure` 是**单调递增**的（`prefs.getInt(key,0)+1` 后 `commit`）。

**后果（实测）**：计数一旦到 3，**之后每一次启动都先 +1 再回滚，永远不再尝试拉包**——设备被永久钉在内置基线上，**连后续修好的更新也收不到**。实测：命中阈值后，一次“完整启动”与普通启动均为 **0 个 CP 请求**。

**唯一恢复手段**：`adb shell pm clear <pkg>`（清 prefs）——实测清除后下次启动立即恢复 `crl=1, check=1`。

对照业界：CodePush / Expo Updates 的回滚在设备**成功跑起回滚后 bundle** 后重置计数，以便后续修复能到位；Android RescueParty 也在成功后复位。**本实现对运维是单向门。** 已在 #268 记为待修项。

### 7.2 已实测通过的断言

- **leg A（崩溃环）**：预算=3 时，第 1/2 次启动有 CP 请求、**第 3 次起为 0**（与 `DEFAULT_CRASH_LOOP_MAX=3` 完全吻合）；回滚启动 **crl=0 · check=0**，且应用仍在前台（基线可用）。**PASS**
- **leg B（不可信 CRL）**：把设备 4040 反代到 `--mode unsigned` 的 stub → stub 收到 **1** 次 `/v1/crl`，而 CP **收到 0 次** manifest 请求；换成 `--mode ok` → **1 / 1**。唯一变量是 CRL 可信度，行为随之翻转。**PASS**
- 未能覆盖：**“已安装更新时被篡改 CRL 拒绝”**——需要一个设备信任的候选。实测发现 CP 里已有的 `main-REV2` 候选是用**未知密钥**签的（真实 `gateBundleLoad` 对两把已知密钥都返回 `Ed25519 signature verification failed`），所以设备正确地拒绝了它；要造可安装候选需先走 `ship` 的 release/promote 流水线（本次未完成）。

### 7.3 其他实测教训

- `run-as` 对 **release** 包无效（`package not debuggable`）——读 `installed_update_id`/计数需 debug 包或 root。
- 清 prefs 后 `installed_update_id` 一并丢失，于是任何 production 候选都会被视作 pending。
- `pm clear` 会同时清掉业务数据（本 DUT 无业务数据，影响可忽略）。

### 7.4 ✅ 安装腿（leg 1）实测通过 —— 此前只证明了"拒载"，未证明"能装"

首次真机只证明了设备**拒绝**不可信更新（§7.2）。本次在真机上证明了**相反方向**：设备能**接受并安装**一个可信更新。

**关键发现：DUT 烘焙的信任根，其私钥就在测试环境里**
```
DUT android/.../ota/OtaModule.kt: arr.pushString("71eb8a6c…0f23")
/tmp/e2e-crl-keys/crl-signing-key.pem 的公钥 = 71eb8a6c…0f23   ← 同一把
```
即 CRL 签发钥与设备烘焙钥是同一把，因此**用它签的候选设备会信**。（上一轮 CP 里种子的候选由**未知**钥签，故真实 `gateBundleLoad` 对两把已知钥都返回 `Ed25519 signature verification failed`。）

**候选必须走官方路径产出（并注意一个过时 flag）**
```bash
DIG=$(node ship.mjs ingest-pack --module main --hbc "$BUNDLE" | grep -oE '[0-9a-f]{64}' | head -1)
RN_DELIVERY_LEGACY_SIGN=1 RN_DELIVERY_SIGN_KEY_FILE=/tmp/e2e-crl-keys/crl-signing-key.pem \
  node ship.mjs sign --digest "$DIG" --kind js-update
node ship.mjs release --digest "$DIG" --kind js-update
node ship.mjs promote --digest "$DIG" --kind js-update --from staging --to production
```
⚠️ **`ingest-pack` 的参数是 `--hbc <path>`，不是 `--bundle`。** `scripts/e2e/chain-05-*.sh:57` 与 `chain-07-*.sh:19` 用的是 `--bundle` —— 该 flag 被忽略，于是回落到默认的 `<project>/android/app/src/main/assets/ota/<module>/index.hbc` 并报 "HBC missing … run pack-business first"（而 `scripts/pack-business.mjs` 在当前树中**已不存在**）。这两条链的 js-update 段落很可能因此失败或空转，值得单独核对。

**JS 半（无设备即可验）—— PASS**
```
node scripts/e2e/verify-install-good-update-live.mjs \
  --upstream http://127.0.0.1:4040 --module main --pubkey-hex 71eb8a6c…0f23
→ rc=0   outcome: phase=installed status=installed
  native calls: ensureModuleSlots → writeFileBase64(ota/main/staged/index.hbc)
    → writeFileUtf8(staged/sidecar.json) → setInstalledUpdateId(main-0aad28133bed)
    → setActiveBundlePathForModule → reload → resetStartupFailures
```
即用**真实的** `bootReleaseOta` 打**真实的** CP：CRL 拉取 → manifest → 验签 → 下载 → 摘要校验 → 落槽 → 持久化 → reload 全部走通。

**设备半 —— PASS（两轮差分证据）**
```
CYCLE A（pm clear 后首启）:
  GET /v1/crl                                  ← 先验吊销（fail-closed 顺序）
  GET /v1/js-updates/check?module=main&lane=production
  GET /v1/artifacts/0aad28133bed…3ba10e        ← 真的下载了
  GET /v1/crl                                  ← 安装后 reload 的新一轮启动
  GET /v1/js-updates/check?module=main&lane=production
  （本轮无 artifact 下载 → 已安装，无需重拉）
CYCLE B（force-stop 后重启，状态保留）:
  GET /v1/crl
  GET /v1/js-updates/check?module=main&lane=production
  （无 artifact 下载 → installed_update_id 已持久化）
app 存活: pid 3813 · logcat 无任何验签/安装错误
```
**判定**：首启下载 → 复位后不再下载，即 `installed_update_id` 已持久化、更新已生效。设备信任链（签名 CRL + 候选 seal）在真机上对**可信**输入放行，对**不可信**输入拒载（§7.2），两个方向都成立。

**诚实边界**：release 包不可 `run-as`，因此**无法直接读出**持久化的 `installed_update_id` 字面值；上面的"后续启动不再下载"是其**行为证据**。日志里也看不到 JS 侧决策——原生 `logJs` 桥存在但生成壳从不调用（已开 **#271**）。

### 7.5 ⚠️ chain-11 首次真正跑起来：2 FAIL（需调查，勿当结论）

**先修了链本身**：`dut_native_surface_ok()` 原先要求 DUT 壳内含 `v1/crl`/`fetchRevocations` —— 而 #257 已把 CRL 拉取移进 shell-core，生成壳里**恒为 0 命中**。于是链的两条安全设备腿**永远 SKIP**，且给出的理由把责任推给 DUT（"legacy host 不满足"），没人会去怀疑检查本身。改为断言现存的 `bootReleaseOta` 后，链首次跑到设备腿。**这是 #257 自身造成的验证回归。**

跑起来后的真实结果（`chain-11 rc=1`，**2 FAIL / 0 SKIP**）：

```
11.C  两宿主 adapter 请求集                  ✓ ×5（含 host option sets 差分）
11.0  preflight                             ✓ adb · DUT com.rnotaacceptance · CP log · pending candidates=1
11.B1 差分控制：CRL 正常 → 更新应被安装        ✓（pid 3813 → 新 pid；CRL 请求 1 次）
11.B2 篡改 /v1/crl → 设备必须拒载             ✗ FAIL
       ✓ stub 命中 1 次（设备确实请求了 /v1/crl → 拒载应来自验签而非跳过）
       ✗ 「被篡改的 CRL 仍安装了更新」—— 判据是 pid 变化
       ✓ 应用仍在基线可运行（fail-closed 不是崩壳）
11.A  崩溃环 → 回滚基线且不再拉包              ✗ FAIL
       ✓ 注入 4 次未完成启动（阈值 3）
       ✗ 「回滚启动仍请求了 manifest（1 次）」
```

**这两个 FAIL 我不断言为产品缺陷，也不当作环境抖动** —— 两个方向都有合理假设，需要下一步专门调查：

- **11.B2**：
  (a) *真缺陷*：设备端没有对 CRL 的 `seal` 做完整性校验，篡改后的吊销清单被接受（即 #253/G3 在真机上失效）；
  (b) *判据伪影*：`"已安装" 用 pid 变化判定*，而 pid 变化也可能来自上一次 B1 遗留或注入导致的重启，不代表本次更新真的生效。
  另外该 stub 究竟改了 `seal` 还是只改 `revoked`/`payload` 需核实——若只改 `revoked` 而不重签，`publisher` 侧的行为需要明确。
- **11.A**：
  (a) *注入语义未命中*：4 次"未完成启动"可能并未真正让原生崩溃计数递增（例如被 `am force-stop` 打断了 `recordStartupFailure` 的写盘），于是根本没到阈值、没有回滚，自然照常拉包；
  (b) *#269 修复的行为副作用*：我的修复把"清空计数"放在**回滚之前**，若注入方式会让回滚路径频繁命中，计数可能被反复清零而到不了阈值；
  (c) *真缺陷*：回滚分支确实没有阻止后续拉取。
  注意**上一轮真机曾观察到预期行为**（`rollback launch: crl=0 check=0`，即回滚前未拉包，§7.2），所以 (a)/(b) 的可能性不低 —— 但这恰恰说明**需要一个能区分三者的判据**，而不是沿用 pid/请求计数。

**结论**：链现在**能跑了**，但它给出的判据还不足以把"真缺陷"与"注入/判据伪影"分开。下一步应先把两条腿的**判据**做成可区分的形式（例如直接读回原生崩溃计数与 `installed_update_id`，而不是靠 pid 变化推断），再判定 B2/A 的成败。

### 7.6 ✅ §7.5 的两条 FAIL 已判定：**都是 harness 判定假象，产品行为正确**（直接观测，非推断）

§7.5 让两位假设并存而未下结论。结论现在有了，两条都不是产品缺陷 —— 判定依据是**直接观测**，不是 pid / 请求计数推断。

#### 根因：chain-11 的"已安装"信号恒为真

`restart_app()` 是 `am force-stop` + `am start`，所以 pid **必然**与它之前采样的值不同；`wait_for_pid_change()` 因此无条件成功，调用方把它读作 `INSTALLED=1`。

**负向对照（决定性，甚至不需要重建）**：把设备的 CP 出口指到一个**死端口**（`adb reverse tcp:4040 tcp:1`，无人监听），再重启 App —— pid 依然变了：

```
BEFORE_PID=5297  →  AFTER_PID=6599   # 什么都装不上，pid 照样变
```

推论（双向）：**11.B2 的 `INSTALLED == 0` 断言几乎不可能成立** → 它的 FAIL 是假象；**11.B1 的 PASS 同样是空的**，不能作为"装上了"的证据。

#### 11.B2 判定：**fail-closed 成立**（无 #253/G3 回归）

三条互不依赖的观测通道，全部指向同一结论：

| 通道 | 观测 |
|---|---|
| stub 自己服务的 | `GET /v1/crl 200 (tampered)` —— **篡改确实到达了设备** |
| 控制面收到的 | **零** —— 没有 `/v1/js-updates/check`，更没有 artifact |
| 设备自己的只读原生状态 | `installedId=null`、`activePath=null` |
| 设备自报的启动结论 | `{"status":"failed","reason":"CRL seal invalid"}` |

即：设备**请求了**吊销清单（所以"什么都没试"被排除）→ 收到被篡改的清单 → **在请求 manifest 之前就停下**，并以精确原因拒载。

对照（`--mode ok`，同一流程）：`crl 200 (passthrough)` → `check 200` → **`artifacts/0aad28133bed… 200`（真下载）**。

#### 11.A 判定：**回滚成立**（注入此前根本没落地）

崩溃计数**只统计"死在启动中途"的启动**：`recordStartupFailure`（在 pull 之前）之后、`resetStartupFailures`（只在**完成的**启动上跑，包括 `failed`）之前。所以固定 0.6s 定时杀进程是一场必输的竞速：

- 0.6s **早于** JS 启动 effect → 根本没递增；
- 而一个"已安装"的设备不到 1s 就跑完 pull → reset 已经跑了。

两侧都实测过（0.6s 注入后决定启动仍 check=2 artifact=1）。

改为**证据驱动**：用 stub 的 `--crl-delay-ms` 把吊销清单**挂住 8s**，并且只在该设备**确实请求了 /v1/crl**（= 本次启动的 effect 已跑 → 计数已递增）之后才杀进程。结果：

```
注入已确认落地：4/4 次启动在计数递增后、完成前被杀
设备自报：      skippedReason=crash_loop_rollback        ← 守卫确实触发
```

随后那次 reload 的启动会正常拉包 —— **这是 #269 修复（回滚前清空计数）的预期行为**，也正是旧的"请求计数窗口"判法会把正确行为误判为 FAIL 的原因。

#### 顺带产物

- `cp-crl-tamper-stub.mjs` 新增 **`--crl-delay-ms`**（任意模式下挂住 `/v1/crl`），把"mid-pull"变成确定的杀进程窗口 —— 崩溃环腿从此不靠运气。
- chain-11 三条腿的判定改为**不可被进程重启伪造**的信号：B1 判 **真实 artifact 下载**、B2 判 **降级 CRL 之后是否继续拉取**、A 判 **设备自报的 outcome**（`logJs` 通道；DUT 无该诊断时显式 SKIP，而不是猜）。
- 修后**连续两次**完整真机运行：`chain chain-11-ota-trust: all PASS`，**exit code 0，18 项检查通过**。

## 8. 结果回填（贴到 #268）

```text
DUT: <项目路径> / <package> / <APK digest>
信任根: root_ca_public_key_hex = <…>（确认已烘焙，非模板默认值）
CP: <base url> · /v1/crl 有 seal/payload: <是/否>
链 C  : <PASS/FAIL/证据>
链 B1 : <命令 / 观察 pid 变化 / 判定>        ← 需一个设备信任的候选（见 §7.2）
链 B2 : <stub 命中次数 / manifest 是否发生 / 判定>
链 A  : <注入次数 / manifest 命中次数 / 判定>
E     : <run-all.sh 结果表 / SKIP 项>
结论  : <平台 bug 清单 | 全绿 | 环境抖动清单>
待修  : <如 §7.1 的单向陷阱>
```

## 附：2026-09-14 夜间真机全链扫描（e2e 11 链）

运行环境与本轮结果（真机 vivo V2425A / Android 16 / SDK 36；CP 见下）。

**本轮为隔离并行 lane 而使用的两个环境变量**（默认值下的运行方式见上文）：

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$PATH:$ANDROID_HOME/platform-tools"
export E2E_REPO="$PWD"                 # 被测树（避免源自主 checkout 的 CLI/E2E_REPO）
CP_BASE=http://127.0.0.1:4150 \       # 本 run 的 CP 端口（默认 4040 可能被他人占用）
E2E_CP_LOG=/tmp/e2e-cp-4150.log \     # 必须与上面那个 CP 的访问日志一致，否则设备腿会
                                       # 因为「读的是别人的日志」而误判为无可下载
bash scripts/e2e/run-all.sh
```

设备侧可达性靠 `cp_adb_reverse`：**设备端口恒为 4040**（DUT 烘焙的 cpBaseUrl 就是它自己的
loopback:4040），**宿主端口取 `$E2E_CP`** —— 不再硬编码 4040/4040。

### 本轮逐链结果

| Chain | 结果 | 关键证据 |
|---|---|---|
| 01-cli | ✅ PASS | 改用本仓 `packages/{rn,ship}/bin/*.mjs`（此前依赖全局 `rn`） |
| 03-release-load | ✅ PASS | `拉 host APK 55,787,252 bytes` · `install Success (vivo popup auto-dismissed)` · `MainActivity 在前台` |
| 05-biz-lifecycle | ✅ PASS | 走通 `resolve_module_hbc` → `ingest-pack --hbc`（新修的那条路径） |
| 11-ota-trust | ✅ PASS | 见下 |

**chain-11（信任链真机验收）**：

```
11.B1 差分控制：CRL 正常 → 更新应被安装
  ✓ 更新已下载并生效：/v1/artifacts 命中 1 次（CRL 2 次）
11.B2 篡改 /v1/crl → 设备必须拒载并留在基线
  ✓ 设备确实请求了被降级的 /v1/crl（stub 命中 5 次）→ 拒绝来自验签而非跳过
  ✓ fail-closed 生效：篡改 CRL 后未请求 manifest/artifact（check=0 artifact=0）
  ✓ 应用仍在基线可运行（fail-closed 不是崩壳）
11.A 崩溃环 → 回滚基线且不再尝试拉包
  ✓ 注入已确认落地：4/4 次启动在计数递增后、完成前被杀（阈值 DEFAULT_CRASH_LOOP_MAX=3）
  ✓ 回滚：设备自报 skippedReason=crash_loop_rollback
11.C 两宿主 adapter 请求集差异仅限宿主专属参数
```

**为 11.B1 准备的生产候选**（chain-11 会以精确原因 SKIP 掉设备腿，直到它有可安装目标）：

```bash
cd "$E2E_HOST" && export RN_DELIVERY_SIGN_KEY_FILE=<lab key> RN_DELIVERY_LEGACY_SIGN=1
ship ingest-pack --module main --hbc <DUT 的 Hermes bundle>   # 见 runbook §0 的构建产物
ship sign     --digest <D> --kind js-update
ship release  --digest <D> --kind js-update                   # → staging
ship promote  --digest <D>                                    # → production
```
候选的 seal 必须由 **DUT 烘焙的信任根**对应的私钥签（否则设备会正确拒载）。
### 剩余链结果（同一轮，2026-09-14）

| Chain | 结果 | 关键证据 / 跳过原因 |
|---|---|---|
| 02-debug-multi-bundle | ⊘ SKIP | 2.5 需要 Metro 8081/8082 在跑（链自身标注"手动"）；其余步骤全绿（reverse 6 端口 · 两个业务仓 module.jsonc · debug host 已装 · bundle 物理存在 · debug load policy=permissive） |
| 04-shell-lifecycle | ✅ PASS | |
| 06-host-portal | ✅ PASS | |
| 07-biz-portal | ✅ PASS | 同样走 `--hbc` 路径 |
| 08-update-strategy | ✅ PASS | |
| 09-backend-services | ⊘ SKIP | 9.11b/c/d 三条 **data-service（:8001）未起** → 显式 skip（其余全绿，含 CP 鉴权三连 401/401/400、artifact 可拉、Nous 真业务接口命中、device→host CP 经 `adb reverse` 连通） |
| 10-ios-lifecycle | ✅ PASS | iOS 模拟器链路 |

**诚实标注**：02 与 09 是**前置缺失**导致的显式 SKIP（SKIP≠PASS），不是通过。
- 02 需要先起 Metro（`rn dev` 多 Metro）；本轮未起。
- 09 需要 data-service（容器）在 :8001；该容器栈本轮由另一条 lane 持有，未抢占。
### 全链单次扫描（一次性、权威结果）

```bash
CP_BASE=http://127.0.0.1:4150 E2E_CP_LOG=/tmp/e2e-cp-4150.log \
  bash scripts/e2e/run-all.sh            # → rc=0
```

| Chain | 结果 |
|---|---|
| 01-cli · 02-debug-multi-bundle · 03-release-load · 04-shell-lifecycle · 05-biz-lifecycle | ✅ PASS |
| 06-host-portal · 07-biz-portal · 08-update-strategy · 10-ios-lifecycle · 11-ota-trust | ✅ PASS |
| 09-backend-services | ⊘ **SKIP**（3 个探针因 `data-service` :8001 未起而显式跳过；其余全绿） |

**10 PASS · 1 SKIP · 0 FAIL。**

chain-11 在该轮中的设备腿证据（第三次独立复现）：

```
✓ pending candidates in production: 1
11.B1 ✓ 更新已下载并生效：/v1/artifacts 命中 1 次（CRL 2 次）
11.B2 ✓ 设备确实请求了被降级的 /v1/crl（stub 命中 6 次）→ 拒绝来自验签而非跳过
      ✓ fail-closed 生效：篡改 CRL 后未请求 manifest/artifact（check=0 artifact=0）
      ✓ 应用仍在基线可运行（fail-closed 不是崩壳）
11.A  ✓ 注入已确认落地：4/4 次启动在计数递增后、完成前被杀（阈值 3）
      ✓ 回滚：设备自报 skippedReason=crash_loop_rollback
```

**为什么 09 仍是 SKIP**：`data-service` 由另一条 lane 的容器栈持有（`deploy/distribution-service/docker-compose.yml`），启动它可能 reconcile/重建那条 lane 正在做 DR 演练的栈 —— 因此**刻意不抢占**，按"SKIP≠PASS"如实记录。
