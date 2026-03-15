# Qargo E2E Testing Runbook

## 0) Start both apps with dual tunnels (for two phones)

Use this when LAN mode is unreliable:

1. Ensure you have two ngrok auth tokens (or paid multi-endpoint):
   - Default config for customer app: `~/Library/Application Support/ngrok/ngrok.yml`
   - Driver config for driver app: `~/.ngrok-driver.yml`
2. Kill old tunnel processes:
   - `killall ngrok 2>/dev/null || true`
   - `rm -f /tmp/ngrok-expo-8081.pid /tmp/ngrok-expo-8082.pid`
3. Start customer app tunnel:
   - `unset NGROK_CONFIG && npm run dev:mobile:tunnel`
4. Start driver app tunnel (new terminal):
   - `NGROK_CONFIG="$HOME/.ngrok-driver.yml" npm run dev:driver:tunnel`
5. Verify driver tunnel is using driver config:
   - `tail -n 20 /tmp/ngrok-expo-8082.log`
   - Expect: `open config file path=/Users/<you>/.ngrok-driver.yml`

If you see `ERR_NGROK_334`, both tunnels are still mapped to the same ngrok endpoint/account.

## 1) Test both apps end-to-end

Use two phones:
- Phone A: customer app (`apps/mobile`)
- Phone B: driver app (`apps/driver`)

Use one backend (local or Railway), then set both app `expo.extra.apiBaseUrl` to the same backend URL.

### Flow
1. Driver logs in, completes onboarding (if not already approved), goes online.
2. Driver app sends location updates every ~5s while online.
3. Customer books a shipment (pickup/drop + vehicle + confirm).
4. Driver receives trip offer, accepts.
5. Customer sees assigned driver + live location + timeline updates.
6. Driver completes trip lifecycle actions.
7. Customer rates driver.

Expected:
- Offer appears in driver app quickly.
- Customer tracking screen moves from matching -> assigned -> in transit -> delivered.
- Earnings/history updates on driver side after completion.

## 2) Prove nearest-driver dispatch is working

For each order, use backend APIs to inspect scoring and decisions:

1. Get candidate ranking:
   - `GET /api/dispatch/orders/:orderId/candidates`
2. Get dispatch decisions:
   - `GET /api/dispatch/orders/:orderId/decisions`
3. Get pending offers for a driver:
   - `GET /api/dispatch/drivers/:driverId/offers`

What to verify:
- Candidate list is sorted by `score.total` descending.
- Top candidate has best weighted score from:
  - `etaScore` (route ETA)
  - `ratingScore`
  - `idleScore`
  - `vehicleFitScore`
- Decision logs show:
  - `selectedDriverId`
  - `routeEtaMinutes`
  - `vehicleMatchType`
  - `assignmentMode`

If first driver rejects or offer expires:
- Next decision should show re-offer to next candidate.

## 3) How to verify Google shortest-path mode vs mock mode

Set backend env:
- `ROUTE_PROVIDER=google`
- `GOOGLE_MAPS_API_KEY=<key>`

Then check candidate/decision outputs:
- `routeEtaMinutes` should reflect road ETA from Google Routes.
- Route cache rows in `RouteEtaCache` should show `provider=google`.

If key is missing/invalid, system falls back to mock ETA safely.

## 4) Integration status (current)

Implemented with working API contracts and fallback mode:
- OTP auth (`/api/auth/otp/*`)
- Dispatch offers + accept/reject + expiry + re-offer
- Realtime socket updates
- Driver push token registration and push dispatch pipeline
- KYC workflow + admin review endpoints
- Payments create/confirm/webhook endpoints
- GST e-waybill endpoint
- Insurance quote endpoint

Current live-provider readiness:
- Google Routes: live call supported when key is configured.
- Expo push: live send supported for Expo tokens.
- FCM provider: live send via legacy FCM endpoint when `FCM_SERVER_KEY` is configured.
- OTP provider: Twilio SMS supported when `OTP_PROVIDER=twilio` + Twilio credentials are configured.
- IDfy provider: live verification call supported when `KYC_PROVIDER=idfy` + IDfy credentials are configured.
- Cashfree provider: live verification call supported when `KYC_PROVIDER=cashfree` + Cashfree credentials are configured.
- Surepass provider: live verification call supported when `KYC_PROVIDER=surepass` + Surepass bearer/API key is configured.
- Razorpay: live order creation + webhook verification supported with Razorpay keys.
- Cashfree Payments: live order creation + webhook status updates supported with Cashfree client credentials.
- UPI: intent deep-link flow supported with `UPI_PAYEE_VPA`.
- E-way bill and insurance: external API passthrough supported when API URL/key are configured; otherwise mock fallback.

### Surepass Railway command

```bash
npm run railway:configure-vars -- \
  --backend-service backend \
  --postgres-service Postgres \
  --redis-service Redis \
  --skip-admin \
  --kyc-provider surepass \
  --surepass-api-url 'https://kyc-api.surepass.app' \
  --surepass-static-bearer-token 'YOUR_SUREPASS_BEARER_TOKEN'
railway up --service backend --detach
```

### Cashfree SecureID Railway command

```bash
npm run railway:configure-vars -- \
  --backend-service backend \
  --postgres-service Postgres \
  --redis-service Redis \
  --skip-admin \
  --kyc-provider cashfree \
  --cashfree-client-id 'YOUR_CASHFREE_CLIENT_ID' \
  --cashfree-client-secret 'YOUR_CASHFREE_CLIENT_SECRET' \
  --cashfree-kyc-api-url 'YOUR_SECUREID_KYC_ENDPOINT' \
  --cashfree-api-version '2023-08-01'
railway up --service backend --detach
```

## 5) Release readiness gates before production

1. Run the two-phone scenario for at least 20 bookings.
2. Verify candidate ranking and decisions for random sample orders.
3. Enable and validate each live provider one by one:
   - Google Routes
   - Push (FCM/APNs/Expo path as required)
   - IDfy
   - Cashfree payment checkout + webhooks
   - Razorpay webhooks
   - GST/e-way bill provider
   - Insurance provider
4. Confirm no blocking errors in onboarding, trip assignment, and tracking lifecycle.
