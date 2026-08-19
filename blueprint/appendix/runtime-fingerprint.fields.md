# runtime_fingerprint 字段表（样例说明）

> SAMPLE / 合同字段说明，非生产哈希实现。源自票 [11](../../wayfinding/issues/11-artifact-version-compatibility.md)；schema stub 见 `prototype/reference-skeleton/schemas/runtime-fingerprint.schema.json`。

**定义**：壳内可执行运行时表面的机器指纹。RN 版本号、Hermes 包版本、HBC Bytecode Version **三者不可互相替代**。

## 强制组成

| 字段（逻辑名） | 说明 | 不匹配典型后果 |
|----------------|------|----------------|
| `rnExactTuple` | RN 精确版本元组（含与原子工具链锁定的配套） | 行为/ABI 漂移 |
| `hermesVmIdentity` | Hermes compiler / VM 身份 | 字节码或运行时不兼容 |
| `hbcBytecodeVersion` | **hbc 文件头 Bytecode Version**（整数；≠ RN/Hermes 包版本） | 启动闪退 `Wrong bytecode version` |
| `newArchFlags` | New Architecture 状态与关键运行时开关 | Fabric/TurboModule 路径分裂 |
| `nativeAbiSurfaceDigest` | Codegen / 已链接 TurboModule·Fabric 的**原生 ABI 表面**摘要（壳内 C++/JSI，非仅 JS spec） | 白屏 / JNI 崩；Release 难查 |
| `officialCapabilityNativeLocks`（推荐） | 官方能力包 native 实现版本锁列表 | 部分 API 崩、其余正常 |

## 与宿主底模四维的关系

内部宿主身份底模：

1. `hostAppVersion`
2. `runtime_fingerprint`（本表）
3. `capability_set`
4. `artifact_line`

一线角色不填四维；发 JS 时人对齐发布列车标签，机器展开选择器（见 [js-selector.sample.json](./js-selector.sample.json)）。

对外投影：`compatibility_profile_id` + 人类标签（如 `Android 8.3.1 / A41`）。

## 样例指纹输入（伪）

```json
{
  "rnExactTuple": "0.86.2+hermes-bundled+codegen-locked",
  "hermesVmIdentity": "hermes-v1@<compiler-id>",
  "hbcBytecodeVersion": 96,
  "newArchFlags": { "fabric": true, "turboModules": true, "bridgeless": true },
  "nativeAbiSurfaceDigest": "sha256:SAMPLE_NOT_FOR_PROD",
  "officialCapabilityNativeLocks": [
    "capability.camera@1.2.0-native",
    "capability.location@1.0.3-native"
  ]
}
```
