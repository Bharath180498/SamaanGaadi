# Backend API (NestJS)

## Core Endpoints
- `POST /api/auth/mock-login`
- `GET /api/health`
- `POST /api/orders/estimate`
- `POST /api/orders`
- `POST /api/orders/:orderId/ewaybill`
- `GET /api/orders/:orderId`
- `GET /api/orders/:orderId/timeline`
- `GET /api/orders/:orderId/location-history`
- `POST /api/drivers/location`
- `GET /api/drivers/nearby?lat=&lng=&radius=`
- `POST /api/drivers/:driverId/approve`
- `POST /api/drivers/:driverId/reject`
- `GET /api/drivers/:driverId/earnings`
- `POST /api/dispatch/orders/:orderId/assign`
- `POST /api/dispatch/scheduled/run`
- `POST /api/trips/:tripId/accept`
- `POST /api/trips/:tripId/start-loading`
- `POST /api/trips/:tripId/start-transit`
- `POST /api/trips/:tripId/complete`
- `POST /api/trips/:tripId/sos`
- `GET /api/admin/overview`
- `GET /api/admin/analytics/trips`
- `GET /api/admin/analytics/heatmap`
- `GET /api/admin/fraud-alerts`
- `GET /api/admin/compliance`
- `POST /api/payments/create-intent`
- `POST /api/insurance/quote`
- `POST /api/ewaybill/generate`

## Realtime Events
Socket namespace: `/realtime`

Subscribe events:
- `subscribe:order` with `{ orderId }`
- `subscribe:driver` with `{ driverId }`

Broadcast events:
- `driver:location`
- `trip:assigned`
- `trip:driver-en-route`
- `trip:arrived-pickup`
- `trip:in-transit`
- `trip:completed`
- `driver:next-job`

## Dispatch Behavior
- Score = proximity + rating + idle time + vehicle match (weighted)
- Online drivers get immediate assignment
- Busy drivers can receive one queued next job
