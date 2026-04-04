import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY: "test-secret-key-for-vitest",
      CENTRIFUGO_HTTP_API_KEY: "test-api-key",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
