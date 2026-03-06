# Mobile App (Expo)

## Run on iPhone
1. Install dependencies at repo root: `npm install`
2. Start backend: `npm run dev:backend`
3. Start Expo: `npm run dev:mobile`
4. Open Expo Go on iPhone and scan the QR from terminal.
5. In [app.json](/Users/bharath/Desktop/Porter/apps/mobile/app.json), set `expo.extra.apiBaseUrl` to your Mac LAN IP (example `http://192.168.0.118:3001/api`).

## Role Flows
- Customer:
  - Bharat-style booking flow with dynamic map selection for pick-up and drop
  - Shipment details editor (goods type/value, insurance, min driver rating)
  - GST and optional auto e-way bill generation after booking
  - Live order state, timeline, e-way bill visibility, and post-trip driver rating
  - UPI/cards/cash payment selection
- Driver:
  - Go online/offline
  - Live GPS streaming from driver phone
  - See current + queued next job
  - Execute trip lifecycle transitions with waiting-charge automation
  - View earnings summary and recent completed trips

## Branding
- Bharat logistics palette: saffron (`#F97316`), teal (`#0F766E`), slate (`#0F172A`)
- Typography: Sora + Manrope
