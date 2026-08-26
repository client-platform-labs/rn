# AFK / HITL loop — latest run

**Stamp:** 2026-08-26T13:59:06Z  
**Project:** `/Users/xuwei/Work/my-rn-app`  
**Mode:** `auto` · **adb:** device  
**Verdict:** **FAIL** (29/30 runnable · 1 TRUE-HITL TODO)

## Step results

| ID | Kind | Issue | Status |
|----|------|-------|--------|
| L0-gov | afk | — | PASS |
| L0-test | afk | — | PASS |
| M4c | afk | #14 | PASS |
| CP | afk | #7 | PASS |
| MapB-cp-auth | afk | #24 | PASS |
| MapB-xcf | afk | #25 | PASS |
| MapB-cp-sqlite | afk | #26 | PASS |
| Dist | afk | #15 | PASS |
| BF-gradle | afk | #5 | PASS |
| BF-aar | afk | #5 | PASS |
| BF-bom | afk | #5 | PASS |
| BF-publish | afk | #5 | PASS |
| BF-ios | afk | #5 | PASS |
| BF-consumer | afk | #5 | PASS |
| M2 | afk | #20 | PASS |
| M3 | afk | #21 | PASS |
| M3b | afk | #22 | PASS |
| BF-rct | afk | #5 | PASS |
| M8 | afk | — | PASS |
| M9 | afk | #9 | PASS |
| A5 | afk | #8 | PASS |
| M8b | afk | #22 | PASS |
| M10 | afk | #18 | PASS |
| H-warm | auto | #19 | PASS |
| H-bundler | auto | #5 | PASS |
| H-bf-consumer | auto | #5 | FAIL |
| H-dist | auto | #15 | PASS |
| H-dist-install | auto | #15 | PASS |
| H-bf-l5 | afk | — | PASS |
| A-expo | afk | #16 | PASS |
| T-harmony | true | — | TODO |

## Summary buckets

| Result | Count | Steps |
|--------|-------|-------|
| PASS | 29 | L0-gov, L0-test, M4c, CP, MapB-cp-auth, MapB-xcf, MapB-cp-sqlite, Dist, BF-gradle, BF-aar, BF-bom, BF-publish, BF-ios, BF-consumer, M2, M3, M3b, BF-rct, M8, M9, A5, M8b, M10, H-warm, H-bundler, H-dist, H-dist-install, H-bf-l5, A-expo |
| FAIL | 1 | H-bf-consumer |
| SKIP | 0 | — |
| TODO | 1 | T-harmony |

**Promotion bar:** GF **L5** · BF **L5** (shared M9 + `H-bf-l5`)

Machine JSON: [`afk-hitl-loop-latest.json`](./afk-hitl-loop-latest.json)  
JSONL trace: `afk-hitl-loop-2026-08-26T13-57-51-415Z.jsonl`

Master inventory: [`docs/agents/afk-hitl-loop.md`](../agents/afk-hitl-loop.md)

