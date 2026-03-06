# Porter-Style Logistics Marketplace

Full-stack monorepo for a logistics marketplace platform similar to Porter/Uber Freight.

## Apps
- `apps/backend`: NestJS API, dispatch engine, realtime tracking, payment/insurance/e-way bill modules
- `apps/mobile`: Expo React Native app for customer + driver flows
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
   ```

## Product Roadmap
See [ROADMAP.md](./ROADMAP.md).

## Branding Direction
- Primary: `#F97316` (cargo orange)
- Secondary: `#0F766E` (teal)
- Accent: `#0F172A` (slate)
- Typeface: Sora + Manrope

## Notes
- Payment/GST/Insurance providers are implemented via adapters with mock providers for local development.
- Production integrations should supply real API credentials and webhook handlers.
