FROM node:22-alpine
WORKDIR /app/apps/operator
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5001
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5001"]
