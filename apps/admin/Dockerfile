FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/admin/package.json ./apps/admin/package.json
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @porter/admin

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/admin/.next ./apps/admin/.next
COPY --from=builder /app/apps/admin/package.json ./apps/admin/package.json
COPY --from=builder /app/apps/admin/public ./apps/admin/public
COPY --from=builder /app/apps/admin/next.config.mjs ./apps/admin/next.config.mjs
COPY --from=builder /app/apps/admin/app ./apps/admin/app
COPY --from=builder /app/apps/admin/components ./apps/admin/components
COPY --from=builder /app/apps/admin/lib ./apps/admin/lib
COPY --from=builder /app/apps/admin/postcss.config.js ./apps/admin/postcss.config.js
COPY --from=builder /app/apps/admin/tailwind.config.ts ./apps/admin/tailwind.config.ts
CMD ["npm", "run", "start", "--workspace", "@porter/admin"]
