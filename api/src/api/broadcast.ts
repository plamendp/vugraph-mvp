import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth/middleware.js";
import { broadcastNotification } from "../centrifugo/client.js";

export function broadcastRoutes(app: FastifyInstance): void {
  app.post<{
    Body: { message: string };
  }>(
    "/api/broadcast",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const { message } = req.body;
      if (!message || typeof message !== "string" || !message.trim()) {
        return reply.status(400).send({ error: "Message is required" });
      }

      await broadcastNotification({
        type: "notification",
        message: message.trim(),
        from: req.user!.username,
        timestamp: Date.now(),
      });

      return { success: true };
    },
  );
}
