# Porter Marketplace Product Roadmap

## Mission
Build a high-velocity logistics marketplace that maximizes driver utilization and gives customers reliable, transparent goods movement for intra-city transport.

## Success Metrics
- Dispatch SLA: driver assignment within 60 seconds for 80% of jobs
- Driver utilization: 65%+ active driving/loading time per online hour
- Delivery reliability: 95% on-time trip completion
- Customer retention: 40%+ repeat bookings at 30 days
- Unit economics: positive contribution margin per completed trip

## Phase 0 (Weeks 1-2): Foundation
### Goals
- Establish production-grade monorepo architecture
- Implement core data model and auth scaffolding
- Ship branded mobile/admin UI system

### Deliverables
- NestJS backend skeleton with Postgres, Redis, Socket.io
- Prisma schema + initial migration + seed data
- Expo app baseline with customer + driver shells
- Next.js admin shell with analytics widgets
- Docker local stack and CI checks

## Phase 1 (Weeks 3-6): MVP Launch
### Goals
- Enable complete booking-to-delivery loop
- Support iPhone internal testing with live trip tracking
- Launch digital payment and driver earnings visibility

### Deliverables
- Booking creation, driver matching, trip lifecycle APIs
- Real-time driver location streaming every 5 seconds
- Waiting charge automation after 20-minute free window
- Customer tracking, payment, rating workflows
- Driver online/offline, accept/start/complete flows
- Admin driver verification and pricing rule management

### Exit Criteria
- End-to-end E2E happy path passes in staging
- Crash-free session rate >= 99.5% in internal beta
- Critical P0 defects = 0 for 7 consecutive days

## Phase 2 (Weeks 7-10): Optimization
### Goals
- Improve fill rate and utilization using smarter dispatch
- Reduce idle time using job chaining and pre-assignment
- Introduce quality-aware pricing and segmentation

### Deliverables
- Weighted dispatch scoring with tunable coefficients
- Driver next-job queue prior to current trip completion
- Rating-based pricing multipliers and customer filters
- Heatmap-driven surge and demand forecasting beta

### Exit Criteria
- Driver idle time reduced by 20%
- Average pickup ETA reduced by 15%

## Phase 3 (Weeks 11-14): Compliance + Risk
### Goals
- Add GST e-way bill workflow for enterprise shipments
- Integrate insurance quote + policy issuance workflow
- Strengthen fraud and safety monitoring

### Deliverables
- GSTN/e-way bill adapter with secure document store
- Insurance coverage engine (basic/premium/high value)
- Trip safety timeline, SOS controls, anomaly alerts
- Admin dispute and fraud review queues

### Exit Criteria
- 90%+ e-way bill generation success in UAT
- <1% failed insured shipment policy binding

## Phase 4 (Weeks 15+): Scale to 100k Drivers
### Goals
- Support high-concurrency dispatch and telemetry
- Improve resilience and latency under peak demand

### Deliverables
- Kafka-backed dispatch event streams
- Service decomposition with horizontal autoscaling
- Read replicas and caching strategy for hot paths
- SLO dashboards and incident runbooks

### Exit Criteria
- 100k concurrent online drivers supported in load tests
- p95 API latency < 250ms for dispatch-critical endpoints

## Immediate Sprint Plan (Execution Now)
1. Monorepo + backend core + migration
2. Real-time location + dispatch engine + waiting charges
3. Mobile customer/driver flows + consistent branding
4. Admin approvals + analytics dashboard
5. Dockerized local runbook + test suite
