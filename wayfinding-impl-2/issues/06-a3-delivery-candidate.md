Type: task
Mode: AFK
Status: open
GitHub: #6
Triage: ready-for-agent
Blocked by: 01, 02, 03

# A3 Delivery：七阶段至候选包

## Question

实现 `rn-delivery` 阶段合同编排至可安装候选包（硬门禁分轨、双 SBOM/attest 接口、同物晋级），满足地图 A3？

## 与 Goals 的关系（非新切片）

- `js-update` 按 **`business_module`** 产出（一壳多 Bundle）
- Debug Host vs release 分轨（票 13b）；装包台（票 14）消费本切片候选包元数据

## Working Notes

权威：blueprint/03、research/01 P1–P17、票 03 身份脊柱。GitHub #6 为活工单。

### Landed (2026-08-25 AFK slice)

- **七阶段合同 stub**：`validate → compile → sign → test → attest → promote → submit`（`stages.ts`）；单步前进；`debug-host` 禁 promote/submit
- **候选包元数据**：`CandidateMetadata` + JSON Schema；含 `digest`、`profile`、`stage`、可选 `runtime_fingerprint_digest`、双列车 `supply_chain` 槽
- **`business_module` hooks**：`js-update` 校验强制；同物晋级要求 module 一致
- **同物晋级纯函数**：`assertSameArtifactPromote`（digest 密封 + release 档）
- **`rn-delivery build`**：输出上述元数据；`--profile debug-host|release`（默认 debug-host）；仍只真跑 compile（Gradle/xcodebuild）

### Remains for DoD

- [ ] 其余阶段后端（validate/sign/test/attest/promote/submit）可替换执行，非 stub
- [ ] release 档真构建（非仅 metadata 标签）；iOS digest 密封
- [ ] 双 SBOM/attest **生成**后端（接口已预留）
- [ ] `js-update` 按 module 的 `rn-delivery update` 产出路径
- [ ] 硬门禁分轨接到真实 lint/ABI/契约门（P6）
- [ ] 装包台（票 14）消费端联调
