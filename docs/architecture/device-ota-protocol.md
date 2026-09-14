# 设备 OTA 协议（device OTA protocol · C6）

**Status:** draft → v1 · **Opened:** 2026-09-14 · map-j/T5 (#294)
**用途：** 企业自实现 OTA 客户端或分发服务端时的唯一协议依据（不读代码）。探针/演练兜底防漂移。

---

## 0. 角色与产物

| 角色 | 是谁 | 备注 |
| ------ | ------ | ------ |
| 设备运行时 | shell-core（`createOtaClient` / `bootReleaseOta`），随 `rn init` 嵌入 App | 企业可不替换 |
| 分发服务端 | `client-platform/cp` 容器（`/v1/js-updates/check`、制品库） | 企业可自实现（本协议即契约） |
| 清单 sidecar | `.rn/delivery/updates/<module>/<update_id>.json` | 由 `ship sign` 产出 |
| 制品 HBC | digest 寻址的 Hermes bytecode bundle | 由 `ship update` 产出 |

## 1. 设备启动（boot）

```text
启动 → cacheBakedPublicKeys（烘焙的 RCA/K1/K2 公钥）
     → 无 cpBaseUrl？→ 直接渲染嵌入的 baseline（fail-loud 告警）
     → crash-loop 判定：连续失败 ≥ 阈值（默认 DEFAULT_CRASH_LOOP_MAX）？
         → 清失败计数 → 记录回滚的 update_id → 回退嵌入 baseline
     → 拉 manifest（见 §2）
     → 验签/CRL（见 §4）→ 装槽（见 §5）→ reload
```text

boot 阶段（`OtaBootPhase`）：`baseline`（渲染嵌入基线）| `installed`（已应用更新，reload 中）。

## 2. check-for-update（拉清单）

设备请求分发服务端，取清单 sidecar（JSON）：

- URL：`GET {cpBaseUrl}/v1/js-updates/check?lane={staging|production}&module={moduleId}`（或服务端约定的 manifestUrl）
- 返回：`OtaSidecar`（见 §3）
- 设备侧过滤：`business_module` 必须等于本模块 id；`channel` 若存在必须匹配请求 channel；否则视为无更新。
- 生产环境：**最新 production 候选胜出**（promote 追加到 production 窗口作为回滚历史，最后一条是当前发布）。

## 3. 清单 sidecar 字段（OtaSidecar）

| 字段 | 类型 | 含义 |
| ------ | ------ | ------ |
| `update_id` | string | 更新标识（`<module>-<digest 前 12>`） |
| `digest` | string | 制品 sha256 |
| `signature` | string | seal，格式 `pem:ed25519:<base64>`（ADR-017） |
| `cert_chain` | `{leafCertPem, leafPubkeyHex}` | ADR-024 证书链：设备验「leaf 在烘焙 RCA 之下」再验「seal 在 leaf 之下」 |
| `release_id` | string | 签名上下文，必须与 ship seal payload 一致 |
| `artifact_kind` | `js-update` 等 | 制品类型 |
| `candidate` | JsUpdateCandidate | 候选元数据（runtime_fingerprint 等） |
| `host_context` | `{artifact_line, runtime_fingerprint}` | 宿主上下文 |
| `business_module` | string | 业务模块 id |
| `channel` | string | 渠道 |
| `url` | string | HBC 下载地址（http(s)） |
| `hbc_relpath` | string | HBC 相对路径 |

## 4. 验签与吊销（fail-closed）

设备拿到 sidecar 后，在 **任何加载之前** 执行 `gateBundleLoad`（`@client-platform/core/ota`）：

1. **信任根**：设备烘焙 RCA / K1/K2 公钥（`native.getOtaPublicKeys()`）。
2. **seal 验证**：`signature` = `pem:ed25519:<b64>`，用烘焙公钥验 Ed25519 签名，且签名 payload 必须匹配 `release_id` / `digest` / `artifact_kind`（ADR-017 语义）。
3. **证书链（ADR-024 默认）**：若 sidecar 带 `cert_chain`，先验「leaf 证书在烘焙 RCA 之下」，再用 leaf 公钥验 seal；旧的无链 CRL/单钥仍兼容。
4. **吊销（CRL）**：验 `/v1/crl` 的 `verifyRevocationSealAny(seal, payload, [烘焙RCA公钥])`。
   - CRL 存在但未签名/验签失败/被篡改 → **hard-fail**（攻击信号，无歧义）
   - CRL 不可达（404/5xx/网络/超时）→ 与 manifest 同源同 CP，视为部署一致性问题；保持 fail-closed（#253 语义，见 seam-deepening-map §8）
5. **指纹/加载门禁**：`gateBundleLoad` 核对 runtime_fingerprint、禁止跨包 import（purity scan）等。
6. 任一失败 → **拒绝加载**（fail-closed），设备继续跑当前槽位或嵌入 baseline。

## 5. 安装（双槽位）

```text
ensureModuleSlots(moduleId)        # 槽位就绪
fetch HBC（candidate.url, http(s)）→ 写 staged/index.hbc（base64）
写 staged/sidecar.json
installAndReload：
    setActiveBundlePathForModule(moduleId, hbcPath)
    （可选）setRootModuleId(moduleId)
    reload()
```text

- 更新装入 **staged 槽位**，激活后 reload；嵌入 baseline 常驻，作为回退目标。
- `hbc_relpath` / 槽位路径由 `moduleSlotRel(moduleId, "staged")` 约定。

## 6. 回滚

**自动（设备端，零运维动作）：**
- crash-loop：连续启动失败 ≥ `DEFAULT_CRASH_LOOP_MAX` → 清计数、记录被回滚的 `update_id`、回退嵌入 baseline。
- 被回滚的 `update_id` 被标记（`setRolledBackUpdateId`），后续启动**拒绝再应用**它（#269 语义：stop re-applying a rolled-back update）。
- 计数器清空是恢复的一部分，且必须在 reload 之前完成（否则是单向陷阱——曾实测）。

**手动（运维，CP API）：**
- `/v1/kill`（biz module / update_ids，落 registry kills）
- `/v1/block`（digest，进 blocked）
- 设备拉取时，kills/blocked/revocations 会拒绝对应候选（`blockedUpdateIdsForRuntime`）。

## 7. 信任材料与密钥角色（ADR-018）

- `ship keygen` 产出：`label.rca.key/crt`（根）、`label.key/csr/leaf.crt`（leaf）、`.srl`。
- CRL 与 release **同一套信任模型**：CRL 由 leaf 签 + 附 `cert_chain`；设备验「leaf 在烘焙 RCA 之下」再验「seal 在 leaf 之下」。
- 吊销列表发布在 `/v1/ota/revocations`（K2 语义）/ `/v1/crl`（证书链语义）。

---

## 实现锚点

- 客户端：`packages/shell-core/src/ota-client.ts`（checkForUpdate / fetchUpdate / installAndReload / rollbackToEmbeddedBaseline / verifySidecar）
- 启动序列：`packages/shell-core/src/release-boot.ts`（bootReleaseOta：crash-loop → pull → 验 CRL → 验 seal → 装槽）
- 加载门禁：`@client-platform/core/ota`（gateBundleLoad）
- 吊销验签：`verifyRevocationSealAny`
- 服务端端点：`serve.ts`（`/v1/js-updates/check`、`/v1/crl`、`/v1/ota/revocations`、制品库按 digest）
- 端到端验证：`scripts/e2e/chain-11-ota-trust.sh` · `verify-crl-*.mjs` · `ota-client.test.ts` · `pull-ota.test.ts`
