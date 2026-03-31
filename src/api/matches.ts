import type { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import type { DB } from "../db/database.js";
import type { MatchStatus } from "../engine/types.js";

export function matchRoutes(app: FastifyInstance, db: DB): void {
  app.post<{
    Body: { title: string; segment?: string; homeTeam: string; awayTeam: string };
  }>("/api/matches", (req, reply) => {
    const { title, segment, homeTeam, awayTeam } = req.body;
    const match = db.createMatch({
      id: uuid(),
      title,
      segment: segment ?? "",
      homeTeam,
      awayTeam,
      status: "pending",
    });
    reply.code(201).send(match);
  });

  app.get("/api/matches", (_req, reply) => {
    reply.send(db.listMatches());
  });

  app.get<{ Params: { id: string } }>("/api/matches/:id", (req, reply) => {
    const match = db.getMatch(req.params.id);
    if (!match) {
      reply.code(404).send({ error: "Match not found" });
      return;
    }
    reply.send(match);
  });

  app.patch<{
    Params: { id: string };
    Body: { status: MatchStatus };
  }>("/api/matches/:id", (req, reply) => {
    const match = db.getMatch(req.params.id);
    if (!match) {
      reply.code(404).send({ error: "Match not found" });
      return;
    }
    db.updateMatchStatus(req.params.id, req.body.status);
    reply.send(db.getMatch(req.params.id));
  });

  app.delete<{ Params: { id: string } }>("/api/matches/:id", (req, reply) => {
    const match = db.getMatch(req.params.id);
    if (!match) {
      reply.code(404).send({ error: "Match not found" });
      return;
    }
    db.deleteMatch(req.params.id);
    reply.code(204).send();
  });
}
