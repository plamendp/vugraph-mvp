import type { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import type { IDatabase } from "../db/types.js";
import type { MatchStatus } from "../engine/types.js";

export function matchRoutes(app: FastifyInstance, db: IDatabase): void {
  app.post<{
    Body: { title: string; segment?: string; homeTeam: string; awayTeam: string };
  }>("/api/matches", async (req, reply) => {
    const { title, segment, homeTeam, awayTeam } = req.body;
    const match = await db.createMatch({
      id: uuid(),
      title,
      segment: segment ?? "",
      homeTeam,
      awayTeam,
      status: "pending",
    });
    reply.code(201).send(match);
  });

  app.get("/api/matches", async (_req, reply) => {
    reply.send(await db.listMatches());
  });

  app.get<{ Params: { id: string } }>("/api/matches/:id", async (req, reply) => {
    const match = await db.getMatch(req.params.id);
    if (!match) {
      reply.code(404).send({ error: "Match not found" });
      return;
    }
    reply.send(match);
  });

  app.patch<{
    Params: { id: string };
    Body: { status: MatchStatus };
  }>("/api/matches/:id", async (req, reply) => {
    const match = await db.getMatch(req.params.id);
    if (!match) {
      reply.code(404).send({ error: "Match not found" });
      return;
    }
    await db.updateMatchStatus(req.params.id, req.body.status);
    reply.send(await db.getMatch(req.params.id));
  });

  app.delete<{ Params: { id: string } }>("/api/matches/:id", async (req, reply) => {
    const match = await db.getMatch(req.params.id);
    if (!match) {
      reply.code(404).send({ error: "Match not found" });
      return;
    }
    await db.deleteMatch(req.params.id);
    reply.code(204).send();
  });
}
