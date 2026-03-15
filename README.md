# Porter-Style Logistics Marketplace

Full-stack monorepo for a logistics marketplace platform similar to Porter/Uber Freight.

## Apps
- `apps/backend`: NestJS API, dispatch engine, realtime tracking, payment/insurance/e-way bill modules
- `apps/mobile`: Expo React Native customer app
- `apps/driver`: Expo React Native driver app (OTP auth, onboarding/KYC, jobs, earnings, history, profile)
- `apps/admin`: Next.js admin dashboard
- `packages/shared`: shared types/constants

## Quick Start
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start infra:
   ```bash
   docker compose up -d postgres redis
   ```
3. Configure backend env:
   ```bash
   cp apps/backend/.env.example apps/backend/.env
   ```
4. Run migrations and seed:
   ```bash
   npm run prisma:migrate --workspace @porter/backend
   npm run prisma:seed --workspace @porter/backend
   ```
5. Start services:
   ```bash
   npm run dev:backend
   npm run dev:admin
   npm run dev:mobile
   npm run dev:driver
   ```

## Product Roadmap
See [ROADMAP.md](./ROADMAP.md).

## AWS Production Launch
- Infra: Terraform in [`infra/aws/terraform`](./infra/aws/terraform)
- One-command release:
  ```bash
  ./infra/aws/scripts/release.sh --region ap-south-1
  ```
- Full runbook: [`infra/aws/docs/LAUNCH_RUNBOOK.md`](./infra/aws/docs/LAUNCH_RUNBOOK.md)

## Railway Launch
- Railway setup docs: [`infra/railway/README.md`](./infra/railway/README.md)
- Launch runbook: [`infra/railway/LAUNCH_RUNBOOK.md`](./infra/railway/LAUNCH_RUNBOOK.md)
- Beginner step-by-step: [`FOLLOW_ME_DEPLOY.md`](./FOLLOW_ME_DEPLOY.md)
- Configure vars:
  ```bash
  npm run railway:configure-vars
  ```
- Deploy both services:
  ```bash
  npm run railway:deploy
  ```

## Branding Direction
- Primary: `#F97316` (cargo orange)
- Secondary: `#0F766E` (teal)
- Accent: `#0F172A` (slate)
- Typeface: Sora + Manrope

## Notes
- Payment/GST/Insurance/KYC/Route/Push providers are adapter-based with mock fallback for local development.
- Dispatch v2 uses Redis geo shortlist + route ETA provider + trip offer lifecycle (accept/reject/expire/re-offer).
- Backend feature flags:
  - `AUTH_MODE=otp|mock`
  - `ROUTE_PROVIDER=google|mock`
  - `KYC_PROVIDER=mock|idfy|cashfree|surepass`
  - `PUSH_PROVIDER=fcm|mock`
- Production integrations should supply real API credentials and webhook handlers.
