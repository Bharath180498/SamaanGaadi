# Qargo Scale Readiness (10k Rides/Day)

## Verdict (Current State)
- **Demo readiness:** Yes.
- **Safe for sustained 10k rides/day in production:** **Not yet**.
- **Can launch in 2 days?** Yes, as a controlled launch/beta, if P0 items below are completed first.

10k rides/day is only ~0.12 rides/sec average, but peak-hour traffic and location pings dominate load. The current architecture will bottleneck under peak conditions without a few hardening changes.

## What Is Already Strong
- Modular backend with clear domains (dispatch, trips, payments, support, admin AI).
- Redis-backed geo index and location history already in place.
- Prisma + Postgres + migration workflow is set up.
- Admin operations/support APIs and dashboard are implemented and usable.

## Critical Gaps (Must Fix)

### P0 (Blockers for reliable scale + security)
1. **Public mutating APIs without user auth guards**
- Most customer/driver endpoints are not protected by JWT guards and rely on IDs from request params/body.
- References:
  - `apps/backend/src/modules/orders/orders.controller.ts:8`
  - `apps/backend/src/modules/trips/trips.controller.ts:8`
  - `apps/backend/src/modules/payments/payments.controller.ts:7`
  - `apps/backend/src/modules/drivers/drivers.controller.ts:9`

2. **Secrets committed in deploy script defaults**
- Real API keys/secrets are hardcoded in `.env.railway.setup.sh` defaults.
- This is a security incident risk (rotate immediately).
- References:
  - `.env.railway.setup.sh:28`
  - `.env.railway.setup.sh:39`
  - `.env.railway.setup.sh:47`
  - `.env.railway.setup.sh:59`

3. **Dispatch housekeeping is manual, not scheduled worker-driven**
- Offer expiry and scheduled dispatch are only exposed as HTTP endpoints, no cron/worker loop in app.
- References:
  - `apps/backend/src/modules/dispatch/dispatch.controller.ts:39`
  - `apps/backend/src/modules/dispatch/dispatch.controller.ts:44`
  - `apps/backend/src/modules/dispatch/dispatch.service.ts:690`
  - `apps/backend/src/modules/dispatch/dispatch.service.ts:928`

4. **No horizontal Socket.IO scale strategy**
- Realtime gateway has open CORS and no auth; also no Redis adapter for multi-instance fanout.
- If backend scales to >1 instance, room events can fragment.
- References:
  - `apps/backend/src/modules/realtime/realtime.gateway.ts:12`
  - `apps/backend/src/modules/realtime/realtime.gateway.ts:14`

5. **High-frequency location updates hit Postgres on every ping**
- `updateLocation` writes DB per ping + Redis write; this is costly at peak concurrency.
- References:
  - `apps/backend/src/modules/drivers/drivers.service.ts:135`
  - `apps/backend/src/modules/drivers/drivers.service.ts:142`
  - `apps/backend/src/modules/drivers/drivers.service.ts:166`

### P1 (Performance reliability for 10k/day)
1. **Missing critical DB indexes on hot tables**
- `Order` and `Trip` models have status/time fields queried heavily but no composite indexes for common patterns.
- References:
  - `apps/backend/prisma/schema.prisma:279`
  - `apps/backend/prisma/schema.prisma:314`
  - Frequent status counts/queries:
    - `apps/backend/src/modules/admin/admin.service.ts:341`
    - `apps/backend/src/modules/admin/admin.service.ts:403`

2. **Unbounded/large queries in request path**
- Analytics endpoints load multi-day full datasets into memory.
- Customer order list and driver earnings can return large result sets without pagination caps.
- References:
  - `apps/backend/src/modules/admin/admin.service.ts:93`
  - `apps/backend/src/modules/admin/admin.service.ts:144`
  - `apps/backend/src/modules/orders/orders.service.ts:250`
  - `apps/backend/src/modules/drivers/drivers.service.ts:584`

3. **Push notifications are awaited in dispatch critical path**
- Dispatch waits on push provider calls before returning.
- References:
  - `apps/backend/src/modules/dispatch/dispatch.service.ts:253`
  - `apps/backend/src/modules/dispatch/dispatch.service.ts:518`
  - `apps/backend/src/modules/dispatch/dispatch.service.ts:859`

4. **Geo search can return very large sets**
- Redis `GEORADIUS` currently has no `COUNT` cap.
- References:
  - `apps/backend/src/modules/drivers/drivers.service.ts:220`

5. **External map requests without timeout in some paths**
- `placeDetails` and `route` use `fetch` without abort timeout protection.
- References:
  - `apps/backend/src/modules/maps/maps.service.ts:420`
  - `apps/backend/src/modules/maps/maps.service.ts:524`
  - `apps/backend/src/modules/maps/maps.service.ts:573`

### P2 (Operational maturity)
1. **Limited automated test coverage**
- Backend currently has only one spec file.
- Reference:
  - `apps/backend/src/modules/pricing/pricing.service.spec.ts`

2. **No load test harness in repo**
- No k6/artillery/autocannon scripts currently present.

3. **No explicit rate-limit middleware for public APIs**
- Main bootstrap sets CORS + validation, but no global throttling/edge controls shown.
- Reference:
  - `apps/backend/src/main.ts:10`

4. **Railway config defines deploy behavior, not scale policy**
- Health/restart configured; scaling strategy is not encoded.
- Reference:
  - `apps/backend/railway.json:14`

## Is Current Infra Sufficient?
- **For investor demo + early launch traffic:** likely yes.
- **For sustained 10k/day with peak safety:** **not sufficient yet** unless you add:
  - multi-instance backend + websocket adapter,
  - index + query hardening,
  - background workers,
  - security/rate limits,
  - basic observability + load-tested limits.

## 48-Hour Launch Plan (Realistic)

### Day 0-1 (before/with launch)
1. Rotate all leaked keys and remove hardcoded secrets from repo scripts.
2. Add JWT guards for customer/driver mutating endpoints.
3. Add a scheduler/worker (or external cron) to call:
   - offer expiry processing,
   - scheduled dispatch processing.
4. Add DB indexes for hot paths:
   - `Order(status, createdAt)`, `Order(customerId, createdAt)`
   - `Trip(status, createdAt)`, `Trip(driverId, status, createdAt)`
   - `Payment(provider, providerRef)`
5. Add caps/pagination:
   - `orders.list`, `drivers.earnings`, `dispatch.getDriverPendingOffers`.
6. Move push sends off synchronous dispatch path (queue + async worker).

### Day 2-7 (to be genuinely 10k/day ready)
1. Add Redis adapter for Socket.IO and websocket auth.
2. Shift driver live location write model:
   - write heartbeat/location to Redis frequently,
   - batch/persist to Postgres at lower frequency.
3. Add API throttling + WAF/edge rate limits.
4. Add structured metrics + alerts (p95 latency, DB CPU, Redis memory, error rate).
5. Run load tests and lock SLOs.

## Suggested SLO + Capacity Targets
- API p95 latency:
  - read endpoints: <300 ms
  - write endpoints: <500 ms
- Dispatch assignment completion p95: <2s
- Websocket event fanout p95: <1s
- Error rate: <1%
- Availability: 99.9%

Load-test gates before claiming 10k/day-ready:
1. Peak booking burst: 3-5 req/s sustained 30 min.
2. Concurrent active rides: 1k with location updates every 3-5s.
3. Admin dashboard polling from 5-10 concurrent admin users.
4. Dispatch correctness under concurrent offer accept/reject races.

## Recommendation for Tomorrow
- Proceed with launch prep **only after P0 items** are done.
- Then add KYC + OTP improvements.
- Treat 10k/day readiness as a 1-week stabilization sprint, not a same-day toggle.
