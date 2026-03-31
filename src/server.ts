import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { PORT, HOST, DB_PATH } from "./config.js";
import { DB } from "./db/database.js";
import { RoomManager } from "./ws/rooms.js";
import { handleMessage } from "./ws/handler.js";
import { matchRoutes } from "./api/matches.js";
import { boardRoutes } from "./api/boards.js";

const app = Fastify({ logger: true });
const db = new DB(DB_PATH);
const rooms = new RoomManager();

// REST routes
matchRoutes(app, db);
boardRoutes(app, db);

// Health check
app.get("/api/health", () => ({ status: "ok" }));

// Start HTTP server, then attach WebSocket
const start = async () => {
  await app.listen({ port: PORT, host: HOST });

  const wss = new WebSocketServer({ server: app.server });

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      handleMessage(ws, data.toString(), rooms, db);
    });

    ws.on("close", () => {
      rooms.removeDisconnected(ws);
    });
  });

  console.log(`Bridge Vugraph server running on http://${HOST}:${PORT}`);
  console.log(`WebSocket server ready`);
};

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
