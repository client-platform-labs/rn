# Hermes D0 / #43 exit · 2026-08-31 → closed 2026-09-01

**Map:** [#43](https://github.com/client-platform-labs/rn/issues/43) — **CLOSED**  
**Repos:** `tiangong-labs/desk` · `tiangong-labs/host-android`  
**Loops:** `run-hermes-d0-loop.mjs` · `run-hermes-43-loop.mjs`

## Exit criteria

| Spec §8 | Evidence |
|---------|----------|
| 独立仓 + Release 内置 baseline 冷启 | A1 PASS |
| verify → 真 reload；失败 → baseline | A2 + T1 + T2 PASS |
| Dev 不依赖壳内业务源 | Metro → desk；无 `modules/<biz>` |
| Topology B deprecated 文档 | ARCHITECTURE/CONTEXT/DELIVERY/map |
| Dx closure + D1/D2 deferred | 43-loop PASS · #58/#59 |

## Explicitly outside this map (not unfinished #43 work)

| Item | Why outside |
|------|-------------|
| `applicationId` rename off `com.hermesgfapp` | Store/branding; runtime OTA does not depend on it |
| CDN/HSM production signing | Stub digest=signature is the D0/Dx contract; swap when CP keys exist |
| D1 second module / D2 Re.Pack | Pain-gated (#58/#59) |

Device HTTP path is **implemented**: `OtaClient.fetchUpdate` + `TiangongOta.writeFileBase64/Utf8` (needs real manifest URL in prod).
