import type { FastifyInstance } from "fastify";
import type { IDatabase } from "../db/types.js";
import type { RoleName } from "../auth/types.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken } from "../auth/jwt.js";
import { requireRole } from "../auth/middleware.js";

export function authRoutes(app: FastifyInstance, db: IDatabase): void {
  // Login — public, no auth required
  app.post<{
    Body: { username: string; password: string };
  }>("/api/auth/login", async (req, reply) => {
    const { username, password } = req.body;

    const user = await db.getUserByUsername(username);
    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const roles = await db.getUserRoles(user.id);
    const token = signToken({ sub: user.id, username: user.username, roles });

    return reply.send({
      token,
      user: { id: user.id, username: user.username, roles },
    });
  });

  // Register — admin only
  app.post<{
    Body: { username: string; password: string; roles: RoleName[] };
  }>(
    "/api/auth/register",
    { preHandler: [requireRole("admin")] },
    async (req, reply) => {
      const { username, password, roles } = req.body;

      const existing = await db.getUserByUsername(username);
      if (existing) {
        return reply.code(409).send({ error: "Username already exists" });
      }

      const passwordHash = await hashPassword(password);
      const user = await db.createUser(username, passwordHash);

      for (const role of roles) {
        await db.assignRole(user.id, role);
      }

      const assignedRoles = await db.getUserRoles(user.id);
      return reply.code(201).send({
        user: { id: user.id, username: user.username, roles: assignedRoles },
      });
    },
  );

  // Me — any authenticated user
  app.get("/api/auth/me", async (req, reply) => {
    if (!req.user) {
      return reply.code(401).send({ error: "Not authenticated" });
    }
    return reply.send({
      id: req.user.sub,
      username: req.user.username,
      roles: req.user.roles,
    });
  });
}
