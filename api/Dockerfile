# Dev container — runs via tsx (no build step)
# packages/types provided at runtime via docker-compose volume mount
FROM node:22-alpine
WORKDIR /app/api
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
EXPOSE 3000
CMD ["npx", "tsx", "watch", "src/server.ts"]
