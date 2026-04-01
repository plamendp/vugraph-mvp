import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "./jwt.js";
import type { JwtPayload, RoleName } from "./types.js";

// Augment FastifyRequest with user property
declare module "fastify" {
  interface FastifyRequest {
    user: JwtPayload | null;
  }
}

const PUBLIC_PATHS = new Set(["/api/auth/login", "/api/health"]);

/**
 * Register a global onRequest hook that verifies JWT Bearer tokens.
 * Skips public paths and Centrifugo proxy paths (they have their own auth).
 */
export function registerAuthHook(app: FastifyInstance): void {
  app.decorateRequest("user", null);

  app.addHook("onRequest", async (req, reply) => {
    if (PUBLIC_PATHS.has(req.url) || req.url.startsWith("/centrifugo/")) {
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing authorization header" });
    }

    try {
      req.user = verifyToken(authHeader.slice(7));
    } catch {
      return reply.code(401).send({ error: "Invalid or expired token" });
    }
  });
}

/**
 * Fastify preHandler that checks the authenticated user has one of the allowed roles.
 */
export function requireRole(...allowed: RoleName[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user || !req.user.roles.some((r) => allowed.includes(r))) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
}
