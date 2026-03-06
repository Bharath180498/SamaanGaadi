FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ./node_modules/.bin/prisma generate --schema apps/backend/prisma/schema.prisma \
  && npm run build --workspace @porter/shared \
  && npm run build --workspace @porter/backend

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
CMD ["node", "apps/backend/dist/src/main.js"]
