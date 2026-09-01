# Hermes GF delivery verify

**stamp:** 2026-08-31T11-55-41-026Z
**ok:** true
**passed/failed:** 12/0
**soft-failed:** 1

| Step | Kind | OK | ms |
|------|------|----|----|
| L1.health | AFK | ✅ | 14 |
| L1.macro | AFK | ✅ | 12 |
| L1.sentiment | AFK | ✅ | 13 |
| L1.messages_detail | AFK | ✅ | 25 |
| L1.reports_detail | AFK | ✅ | 22 |
| L1.portfolio | AFK | ✅ | 10 |
| Prod.api_health | AFK | ✅ | 169 |
| SSH.ecs | AFK | ✅ | 712 |
| L4.steel | AFK | ✅ | 931 |
| L4.js_gate | AFK | ✅ | 86 |
| Device.adb | AUTO-HITL | ✅ | 12 |
| Device.overview_ui | AUTO-HITL | ✅ | 4469 |
| Device.product_tabs | AUTO-HITL | ⚠️ soft | 70 |

## Verdict

Hard gates PASS; soft-fail:

- **Device.product_tabs**: R5 product tabs incomplete; found: 资金; missing: 消息 · 我的 (tap other tabs or rebuild with B1–B4)
