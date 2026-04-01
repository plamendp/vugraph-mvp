import type { FastifyInstance } from "fastify";
import { OPERATOR_TOKEN } from "../config.js";
import { MatchEngine } from "../engine/match-engine.js";
import type { IDatabase } from "../db/types.js";
import type { Call, Card, Seat, Vulnerability } from "../engine/types.js";
import { broadcastToMatch } from "./client.js";

// Active engines keyed by matchId (in-memory; survives across board changes within a session)
const engines = new Map<string, MatchEngine>();

export function getEngine(matchId: string): MatchEngine | undefined {
  return engines.get(matchId);
}

/**
 * Register Centrifugo proxy routes on the Fastify app.
 *
 * Centrifugo calls these as HTTP POST when client events occur:
 * - POST /centrifugo/connect  — client connects
 * - POST /centrifugo/subscribe — client subscribes to a channel
 * - POST /centrifugo/rpc      — client sends an RPC (operator actions)
 */
export function centrifugoProxyRoutes(app: FastifyInstance, db: IDatabase): void {
  // ── Connect Proxy ──
  // Centrifugo sends: { client, transport, protocol, encoding, data }
  // data contains our auth payload: { token, role }
  app.post<{
    Body: {
      client: string;
      transport: string;
      protocol: string;
      encoding: string;
      data?: { token?: string; role?: string };
    };
  }>("/centrifugo/connect", async (req, reply) => {
    const { data } = req.body;
    const token = data?.token;
    const role = data?.role ?? "spectator";

    // Authenticate operators
    if (role === "operator") {
      if (token !== OPERATOR_TOKEN) {
        return reply.send({
          error: { code: 403, message: "Invalid operator token" },
        });
      }
    }

    // Return a user ID and role info
    // Centrifugo will associate this user with the connection
    const userId = role === "operator" ? "operator" : `spectator:${req.body.client}`;

    return reply.send({
      result: {
        user: userId,
        data: { role },
      },
    });
  });

  // ── Subscribe Proxy ──
  // Centrifugo sends: { client, transport, protocol, encoding, user, channel, data }
  app.post<{
    Body: {
      client: string;
      user: string;
      channel: string;
      data?: Record<string, unknown>;
    };
  }>("/centrifugo/subscribe", async (req, reply) => {
    const { channel, user } = req.body;

    // Channels are `match:{matchId}` — verify match exists
    if (channel.startsWith("match:")) {
      const matchId = channel.slice(6);
      const match = await db.getMatch(matchId);
      if (!match) {
        return reply.send({
          error: { code: 404, message: "Match not found" },
        });
      }

      // On successful subscribe, send the current engine state if available
      const engine = engines.get(matchId);
      const responseData = engine
        ? { type: "state", board: engine.getState() }
        : { type: "state", board: null };

      return reply.send({
        result: {
          data: responseData,
        },
      });
    }

    // Unknown channel pattern
    return reply.send({
      error: { code: 403, message: "Unknown channel" },
    });
  });

  // ── RPC Proxy ──
  // Centrifugo sends: { client, transport, protocol, encoding, user, method, data }
  app.post<{
    Body: {
      client: string;
      user: string;
      method: string;
      data: Record<string, unknown>;
    };
  }>("/centrifugo/rpc", async (req, reply) => {
    const { user, method, data } = req.body;

    // Only operators can perform RPC actions
    if (user !== "operator") {
      return reply.send({
        error: { code: 403, message: "Operator authentication required" },
      });
    }

    try {
      const result = await handleRpc(method, data, db);
      return reply.send({ result: { data: result } });
    } catch (err: any) {
      return reply.send({
        error: { code: 400, message: err.message },
      });
    }
  });
}

// ── RPC method handler ──

async function handleRpc(
  method: string,
  data: Record<string, unknown>,
  db: IDatabase,
): Promise<unknown> {
  switch (method) {
    case "load_board": {
      const matchId = data.matchId as string;
      const boardNumber = data.boardNumber as number;
      const dealer = data.dealer as Seat;
      const vulnerability = data.vulnerability as Vulnerability;
      const hands = data.hands as Record<Seat, Card[]>;

      const engine = new MatchEngine(matchId, boardNumber, dealer, vulnerability, hands);
      engines.set(matchId, engine);

      await db.saveBoard(engine.getState());
      await broadcastToMatch(matchId, { type: "state", board: engine.getState() });

      return { success: true };
    }

    case "call": {
      const matchId = data.matchId as string;
      const seat = data.seat as Seat;
      const call = data.call as Call;

      const engine = requireEngine(matchId);
      const result = engine.makeCall(seat, call);
      if (!result.success) throw new Error(result.error);

      // Broadcast the call
      await broadcastToMatch(matchId, { type: "call_made", seat, call });

      // If auction complete, broadcast full state
      if (result.auctionComplete) {
        await broadcastToMatch(matchId, { type: "state", board: engine.getState() });
      }

      await db.saveBoard(engine.getState());
      return { success: true, auctionComplete: result.auctionComplete, contract: result.contract };
    }

    case "play": {
      const matchId = data.matchId as string;
      const seat = data.seat as Seat;
      const card = data.card as Card;

      const engine = requireEngine(matchId);
      const result = engine.playCard(seat, card);
      if (!result.success) throw new Error(result.error);

      await broadcastToMatch(matchId, { type: "card_played", seat, card });

      if (result.trickComplete && result.trickWinner) {
        const trickNum = engine.board.tricks.filter((t) => t.winner).length;
        await broadcastToMatch(matchId, {
          type: "trick_complete",
          winner: result.trickWinner,
          trickNumber: trickNum,
        });
      }

      if (result.playComplete && engine.board.result) {
        await broadcastToMatch(matchId, {
          type: "board_complete",
          result: engine.board.result,
        });
      }

      await db.saveBoard(engine.getState());
      return { success: true, trickComplete: result.trickComplete, trickWinner: result.trickWinner };
    }

    case "undo": {
      const matchId = data.matchId as string;

      const engine = requireEngine(matchId);
      const result = engine.undo();
      if (!result.success) throw new Error(result.error);

      await broadcastToMatch(matchId, { type: "undo_performed", board: engine.getState() });
      await db.saveBoard(engine.getState());

      return { success: true };
    }

    case "set_result": {
      const matchId = data.matchId as string;
      const declarer = data.declarer as Seat;
      const contract = data.contract as string;
      const tricks = data.tricks as number;

      const engine = requireEngine(matchId);
      const result = engine.setResult(declarer, contract, tricks);
      if (!result.success) throw new Error(result.error);

      if (engine.board.result) {
        await broadcastToMatch(matchId, {
          type: "board_complete",
          result: engine.board.result,
        });
      }

      await db.saveBoard(engine.getState());
      return { success: true };
    }

    default:
      throw new Error(`Unknown RPC method: ${method}`);
  }
}

function requireEngine(matchId: string): MatchEngine {
  const engine = engines.get(matchId);
  if (!engine) throw new Error("No board loaded for this match");
  return engine;
}
