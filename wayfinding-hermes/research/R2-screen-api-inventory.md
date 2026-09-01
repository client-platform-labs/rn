# [hermes/R2] Dashboard 屏幕与 API 面对照表

GitHub: #31 · Map: #29

## Architecture

Two backends coexist:

| Backend | Used by |
|---------|---------|
| **data-service** `/v1/*` | Mobile overview (macro/sentiment/flow/index), intraday BFF proxies |
| **Local SQLite** | Trading, sectors, hsgt, reports, signals, admin, auth |

SSE exists (`/v1/sse/stream`) but **unused in UI** — pages poll via `PagePoller`.

## Route Count

- `(main)/` desktop: **14** pages
- `mobile/`: **27** pages
- Other (activate/login/debug): **4**
- **Total: 45** pages · **22** BFF routes

## Auth Gates

| Role | Access |
|------|--------|
| Public | `/activate`, `/api/activate/*` |
| member+ | Most mobile screens |
| vip+ | `/reports`, `/signals` (main + mobile) |
| super_admin | picks, portfolio, admin |

## v1 Priority Matrix (mobile-first RN)

### P0 — Ship first (8 screens + auth)

1. `/activate` → BFF auth
2. `/mobile` overview hub
3. Drill-downs: macro, sentiment, index, flow
4. Messages list (+ detail needs new `/v1/messages/:id`)
5. Trading overview (`/mobile/trading`)

### P1 — Next

- HSGT, sectors, trading detail (paper/quant/risk)
- Reports + signals (VIP gate)

### P2 — Defer

- Intraday, premarket, postmarket
- Picks/portfolio (super_admin)
- Admin, training, dual-track

## BFF Replication for RN

### MUST replicate (auth/secrets)

- `POST /api/activate/verify`
- `GET /api/activate/auto`
- `POST /api/activate/phone`

### Can call data-service directly

- All `/api/intraday/*` (thin aggregation)
- Mobile overview endpoints (already data-service)

### Need NEW data-service endpoints (SQLite-only today)

| Source | Screens |
|--------|---------|
| `reports` table | reports, signals |
| Message detail | `/mobile/messages/[id]` |
| Paper/quant/live tables | `/mobile/trading/*` |
| Theme pool / HSGT | sectors, hsgt, premarket |
| postmarket/premarket BFF | session timing pages |

## Key Gaps

1. **~40% mobile screens** read SQLite server-side — RN cannot reach without new v1 APIs
2. Messages: list=data-service, detail=SQLite — inconsistent
3. Quant decrypt must stay server-side (BFF or data-service)
4. Bottom-nav "荐股" visible to all but super_admin gated — product decision needed
