Type: grilling
Mode: HITL
Status: resolved
GitHub: #3
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 01
Depends on research: 01

# 身份脊柱与 fingerprint 机读合同（地图 A）

## Question

地图 A 必须落地的身份谱系字段、`runtime_fingerprint` 计算/校验合同、以及 `host_support_window` / 矩阵上限的机读形状是什么（对齐蓝图附录 + P1/P3）？

## Answer

（2026-08-20 全推荐）

1. **身份谱系（机读必挂）**  
   `release_id`、`artifact_line`、`artifact_kind`（`app-host` \| `rn-module` \| `js-update`）、`runtime_fingerprint`（对象或其 digest）、`capability_set`、`compatibility_profile_id`；JS 列车另挂 `update_id` / `channel`。

2. **`runtime_fingerprint` 组成**  
   强制：`rnExactTuple`、`hermesVmIdentity`、`hbcBytecodeVersion`、`newArchFlags`、`nativeAbiSurfaceDigest`；推荐 `officialCapabilityNativeLocks`；对外可投影 `sha256` digest 供选择器全等比较。字段名对齐蓝图附录，不另起一套。

3. **指纹 vs 能力（P3）**  
   破坏性 ABI/HBC/Hermes/RN/Codegen → 必变指纹；additive 官方能力 → 指纹稳定子集不变、`capability_set` 变超集；纯 JS → 二者通常不变。指纹管加载，能力集管调用。

4. **support window + 矩阵上限（P1）**  
   机读：`host_support_window`（如 `production`/`previous`）+ `js_artifact_matrix.max_profiles`（企业默认 **3**，可配置）；超出窗拒绝新 JS 绑定；宿主 `Retired` → 关联 JS `Retired`。

5. **落地形态**  
   `@client-platform/rn-core` 提供 JSON Schema + 纯函数：`computeFingerprint` / `fingerprintsEqual` / `validateSupportWindow`；manifest/制品元数据挂字段；CLI/delivery 共用。先合同与单测，再 A1 引用。
