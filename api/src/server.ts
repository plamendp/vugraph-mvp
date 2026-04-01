import Fastify from "fastify";
import { PORT, HOST, DATABASE_URL } from "./config.js";
import { DB } from "./db/database.js";
import { registerAuthHook } from "./auth/middleware.js";
import { authRoutes } from "./api/auth.js";
import { matchRoutes } from "./api/matches.js";
import { boardRoutes } from "./api/boards.js";
import { centrifugoProxyRoutes } from "./centrifugo/proxy-handler.js";

const app = Fastify({ logger: true });
const db = new DB(DATABASE_URL);

// Global JWT auth hook (must be registered before routes)
registerAuthHook(app);

// REST routes
authRoutes(app, db);
matchRoutes(app, db);
boardRoutes(app, db);

// Centrifugo proxy routes
centrifugoProxyRoutes(app, db);

// Health check
app.get("/api/health", () => ({ status: "ok" }));

const start = async () => {
  await db.init();
  await app.listen({ port: PORT, host: HOST });
  console.log(`Bridge Vugraph backend running on http://${HOST}:${PORT}`);
};

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
