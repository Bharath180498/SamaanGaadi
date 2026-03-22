# Driver Allocation Algorithm (Current + Upgrades)

Last updated: 2026-03-22

## Is current path fully optimal?
No. It was functional, but had practical risks:
- high-rated/nearby drivers could get over-selected (starvation for others),
- stale-location drivers could still rank high,
- busy drivers were discovered but not actually used as reliable fallback when online pool was empty.

The dispatch logic has now been upgraded to reduce these issues.

## Current Allocation Algorithm (Implemented)

### 1) Candidate discovery
- Search radius: `DISPATCH_RADIUS_KM` (default `8km`).
- Redis geo indexes:
  - `drivers:online`
  - `drivers:busy`
- Driver eligibility filters:
  - `verificationStatus = APPROVED`
  - vehicle compatibility (`EXACT` or `UPGRADE`)
  - optional min rating (if requested by quote flow)

### 2) ETA + distance
- ETA computed via `RouteEtaService`:
  - Google Routes API (if enabled and key present), otherwise mock ETA model.
  - Cached (10 min) by origin/destination/vehicle cell key.

### 3) Base score
- Base weighted score:
  - ETA: 55%
  - Driver rating: 20%
  - Idle time: 15%
  - Vehicle fit: 10% (`EXACT=1`, `UPGRADE=0.75`)

### 4) Fairness and reliability penalties (new)
- Base score is adjusted with penalties:
  - `assignmentPenalty`: recent assignments (last 60 min)
  - `reliabilityPenalty`: recent rejected/expired offers (last 24h)
  - `freshnessPenalty`: stale last-active/location timestamp
  - `availabilityPenalty`: small penalty for `BUSY` vs `ONLINE`
- Final score = `baseScore - totalPenalty` (clamped to [0,1]).
- Dispatch decision now uses this penalized score.

### 5) Offer selection order (new)
- Select highest-ranked `ONLINE` candidate first.
- If no eligible online candidate:
  - fallback to `BUSY` candidate only if queue-safe:
    - ETA <= 18 min
    - distance <= dispatch radius
    - no existing queued order (`driver:{id}:next-order` absent)
    - no active pending offer for that driver
- Busy fallback offers are logged as `QUEUE_OFFER`.

### 6) Offer lifecycle
- Offer TTL: 120s (`TripOffer = PENDING`).
- On accept:
  - cancel competing pending offers for same order
  - order -> `ASSIGNED`
  - trip created -> `ASSIGNED`
  - driver availability -> `BUSY`
  - ride-start OTP generated
- On reject/expiry:
  - re-offer to next ranked candidate not already tried
  - if none, decision logged as `NO_OFFER`.

### 7) Next-job queue behavior (still current)
- Single-slot queue per driver in Redis:
  - key: `driver:{driverId}:next-order`
  - TTL: 45 min
- Queue offer can be created while driver is on active trip.

### 8) Scheduled bookings
- Scheduled order remains `CREATED` until schedule time.
- Scheduler moves it to `MATCHING` and runs standard assignment flow.

---

## What can still go wrong
- No explicit business tiers yet (VIP/SLA/enterprise priority lanes).
- Single-slot queue may limit throughput for very high demand.
- Zone balancing/supply protection is not yet enforced.
- Score weights are static (not per city/time/category).

---

## Recommended Next Refinement

### Phase 1 (next safe step)
1. Add `dispatchPriority` (`P0..P3`) on orders.
2. Use category-aware score weights (e.g., ETA-heavy for critical jobs).
3. Add admin-level controls for weight tuning per city.

### Phase 2
1. Replace single-slot queue with capped ranked queue (top 2-3).
2. Add zone supply guardrails.
3. Add starvation KPI alarms and auto-tuning hooks.

---

## Operational KPIs to track
- Offer acceptance rate by vehicle type / zone / priority.
- Time-to-first-assignment.
- Re-offer count per delivered order.
- Driver wait-time distribution (p50/p95).
- Cancelled orders due to assignment delay.
