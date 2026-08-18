Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 01, 02, 05, 06, 07
Assignee: cursor-agent

# 制品、版本与兼容矩阵

## Question

源码、原生壳、Runtime SDK、能力包、JS Bundle、Hermes bytecode、静态资源、配置和控制面协议分别形成什么制品，如何寻址、签名、追溯、保留并通过可机读兼容矩阵组合？

必须确定版本语义、构建身份、SBOM/来源证明、环境提升、渠道与租户、壳与 Bundle 兼容、能力声明、缓存键、制品不可变性、保留与销毁、失败时的兼容拒绝和回退规则。

## Answer

制品、版本与兼容矩阵采用“**四维宿主底模 + runtime_fingerprint + JS 选择器 + 人类发布列车标签**”。

1. **版本与身份分层**
   - `release_id`：企业交付事实主键
   - `artifact_line / build_id`：每运行时目标与签名/渠道的制品行
   - `runtime_fingerprint`：壳内可执行运行时表面的机器指纹（见第 3 点）
   - `capability_set`：壳内已链接能力包集合
   - `update_id / channel`：JS/内容更新与灰度身份
   - 对外人类标签：`platform + app_version + release_train`（如 `Android 8.3.1 / A41`）
   - 系统唯一投影：`compatibility_profile_id`

2. **四维是宿主身份，不是 JS 发布表单**
   内部宿主底模仍保留：
   - `hostAppVersion`
   - `runtime_fingerprint`（取代过粗的“RN 轨道口号”）
   - `capability_set`
   - `artifact_line`

   一线角色不填四维。发 JS 时人对齐发布列车；机器展开选择器。

3. **`runtime_fingerprint` 强制组成（物理兼容合同）**
   指纹至少哈希下列项；**RN 版本号、Hermes 包版本、HBC Bytecode Version 三者不可互相替代**：
   - RN 精确版本元组
   - Hermes compiler / VM 身份，并**显式包含 hbc 文件头 Bytecode Version**
   - New Architecture 状态与关键运行时开关
   - Codegen schema / 已链接 TurboModule·Fabric 的原生 ABI 表面（壳内 C++/JSI 绑定，不是仅 JS spec 文件）
   - 官方能力包 native 实现版本锁（推荐）

   已知故障与门禁对应关系：
   - HBC Bytecode Version 不匹配 → 启动闪退（`Wrong bytecode version`）→ 指纹阻断
   - HBC 匹配但 Codegen/TurboModule ABI 不匹配 → 白屏/JNI 崩且 Release 难查 → 指纹阻断
   - 个别模块 ABI 变更 → 部分页面正常、特定 API 崩 → 能力集/模块锁阻断

4. **JS 发布选择器（机器放行公式）**
   ```text
   JS.hbc_bytecode_version  == Host.hermes_vm_bytecode_version
   JS.runtime_fingerprint   == Host.runtime_fingerprint
   JS.required_capabilities ⊆  Host.capability_set
   JS.target_artifact_lines 命中且该行允许 JS 列车
   ```
   - **禁止**四维全等（壳多装未用能力不应作废旧 JS）
   - **禁止**只用 RN 版本号判断能否 OTA
   - 不通过则 `BLOCKED_INCOMPATIBLE`，不得下发

5. **制品不可变性**
   可晋级制品按 `digest(SHA-256) + artifact_identity` 内容寻址；版本号只作索引，禁止原地覆盖重建。

6. **三类载荷与运输**
   - 商店/原生通道：原生、权限、隐私、SDK、RN/Hermes/Codegen 变更
   - JS 列车（生产默认开启）：匹配指纹的业务 Hermes bytecode / JS bundle
   - 内容通道（v1 可并入 JS 列车）：无脚本静态资源；独立 CMS 时再拆

7. **缓存键**
   至少绑定：`runtime_fingerprint`、`capability_set`、`update_id/channel`、`artifact_line` / host profile

8. **SBOM / 来源证明 / 租户环境**
   强制 SBOM、provenance/attestation、符号与 source map 索引、保留策略；查询必须带 `tenant_id + environment_id`
