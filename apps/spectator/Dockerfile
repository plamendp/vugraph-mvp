FROM node:22-alpine
WORKDIR /app/apps/spectator
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5002
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5002"]
