# RunMe (Railway + Local)

Minimal copy-paste commands for this repo.

## 0. One-time setup

```bash
npm i -g @railway/cli
railway login
cd /Users/bharath/Desktop/Porter
railway link --project <YOUR_PROJECT_ID>
```

Required Railway services:
- `backend`
- `Postgres`
- `Redis`
- `admin` (optional)

## 1. Configure vars + deploy backend

Use the repo setup script:

```bash
npm run railway:setup
```

If service names differ from defaults, use:

```bash
npm run railway:configure-vars -- \
  --backend-service <backend-name> \
  --postgres-service <postgres-name> \
  --redis-service <redis-name> \
  --skip-admin

railway up --service <backend-name> --detach
```

## 2. Prisma migration to Railway DB

Run this from local machine whenever `schema.prisma` / migrations changed:

```bash
DATABASE_URL="$(railway variables --service Postgres --json | jq -r '.DATABASE_PUBLIC_URL')" \
npm run prisma:migrate --workspace @porter/backend
```

If it prints `No pending migrations to apply`, you are already up to date.

## 3. Daily backend deploy flow

```bash
# 1) migrate (safe to run)
DATABASE_URL="$(railway variables --service Postgres --json | jq -r '.DATABASE_PUBLIC_URL')" \
npm run prisma:migrate --workspace @porter/backend

# 2) deploy backend
railway up --service backend --detach
```

## 4. Start apps locally

```bash
# backend local
npm run dev:backend

# admin local (point to Railway backend)
NEXT_PUBLIC_API_URL=https://<backend-public-domain>/api npm run dev:admin

# clear cache
pkill -f "expo start --lan --port 8081" || true
pkill -f "start-expo-manual-tunnel.sh . 8081" || true
pkill -f "ngrok.*8081" || true
rm -f /tmp/ngrok-expo-8081.pid /tmp/ngrok-expo-8081.log

# customer app + driver app on separate tunnels (recommended)
# Terminal 1 (customer/mobile)
NGROK_CONFIG="$HOME/.ngrok-mobile.yml" npm run dev:mobile:tunnel

# Terminal 2 (driver)
NGROK_CONFIG="$HOME/.ngrok-driver.yml" npm run dev:driver:tunnel

# if you want cache clear
# Terminal 1
NGROK_CONFIG="$HOME/.ngrok-mobile.yml" npm run dev:mobile:clear
# Terminal 2
NGROK_CONFIG="$HOME/.ngrok-driver.yml" npm run dev:driver:clear
```

## 5. Quick checks

```bash
railway service status --all
curl https://<backend-public-domain>/api/health
```

## 6. Common fixes

`P1001 postgres.railway.internal`
- Cause: local machine cannot access Railway private DB host.
- Fix: run migration with `DATABASE_PUBLIC_URL` command in section 2.

`invalid passcode` in admin login
- `ADMIN_PASSCODE` on backend service does not match what you type.
- Re-run `npm run railway:setup` after updating `.env.railway.setup.sh`.

`service not found`
- Check real names:
  ```bash
  railway service status --all
  ```
