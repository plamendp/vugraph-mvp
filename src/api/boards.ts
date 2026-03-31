import type { FastifyInstance } from "fastify";
import type { DB } from "../db/database.js";
import type { Card, Seat, Vulnerability } from "../engine/types.js";

export function boardRoutes(app: FastifyInstance, db: DB): void {
  app.get<{ Params: { matchId: string } }>(
    "/api/matches/:matchId/boards",
    (req, reply) => {
      reply.send(db.listBoards(req.params.matchId));
    },
  );

  app.get<{ Params: { matchId: string; boardNumber: string } }>(
    "/api/matches/:matchId/boards/:boardNumber",
    (req, reply) => {
      const board = db.getBoard(req.params.matchId, parseInt(req.params.boardNumber, 10));
      if (!board) {
        reply.code(404).send({ error: "Board not found" });
        return;
      }
      reply.send(board);
    },
  );

  app.post<{
    Params: { matchId: string };
    Body: {
      boardNumber: number;
      dealer: Seat;
      vulnerability: Vulnerability;
      hands: Record<Seat, Card[]>;
    };
  }>("/api/matches/:matchId/boards", (req, reply) => {
    const { boardNumber, dealer, vulnerability, hands } = req.body;
    db.saveBoard({
      matchId: req.params.matchId,
      boardNumber,
      dealer,
      vulnerability,
      hands,
      phase: "auction",
      auction: [],
      play: [],
      tricks: [],
    });
    const board = db.getBoard(req.params.matchId, boardNumber);
    reply.code(201).send(board);
  });
}
