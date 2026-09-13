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

## 7. 结果回填（贴到 #268）

```text
DUT: <项目路径> / <package> / <APK 版本或 digest>
信任根: root_ca_public_key_hex = <…>（确认已烘焙，非模板默认值）
CP: <base url> · /v1/crl 有 seal/payload: <是/否>
链 C  : <PASS/FAIL/证据>
链 B1 : <命令 / 观察 pid 变化 / 判定>
链 B2 : <stub 命中次数 / 是否安装 / 判定>
链 A  : <注入次数 / manifest 命中次数 / 判定>
E     : <run-all.sh 结果表 / SKIP 项>
结论  : <平台 bug 清单 | 全绿 | 环境抖动清单>
```
