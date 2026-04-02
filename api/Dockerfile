# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig.json ./
COPY api/src/ src/
COPY packages/types/ /app/packages/types/
RUN npx tsc

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/api/dist/ dist/
COPY api/src/db/schema.sql dist/api/src/db/schema.sql
EXPOSE 3000
CMD ["node", "dist/api/src/server.js"]
