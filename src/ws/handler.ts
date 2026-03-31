import type { WebSocket } from "ws";
import { MatchEngine } from "../engine/match-engine.js";
import type { DB } from "../db/database.js";
import { OPERATOR_TOKEN } from "../config.js";
import { RoomManager } from "./rooms.js";
import type { OutboundMessage } from "./protocol.js";
import { parseInboundMessage } from "./protocol.js";

// Track authenticated clients
const clientInfo = new WeakMap<WebSocket, { role: "operator" | "spectator"; matchId: string }>();

export function handleMessage(
  ws: WebSocket,
  raw: string,
  rooms: RoomManager,
  db: DB,
): void {
  let message;
  try {
    message = parseInboundMessage(raw);
  } catch (err: any) {
    sendError(ws, err.message);
    return;
  }

  switch (message.type) {
    case "auth": {
      if (message.role === "operator" && message.token !== OPERATOR_TOKEN) {
        sendError(ws, "Invalid operator token");
        return;
      }
      const room = rooms.joinRoom(message.matchId, ws, message.role);
      clientInfo.set(ws, { role: message.role, matchId: message.matchId });

      // Send current state if engine exists
      if (room.engine) {
        send(ws, { type: "state", board: room.engine.getState() });
      }
      return;
    }

    case "load_board": {
      if (!requireOperator(ws)) return;
      const info = clientInfo.get(ws)!;
      const room = rooms.getOrCreateRoom(info.matchId);

      const engine = new MatchEngine(
        message.matchId,
        message.boardNumber,
        message.dealer,
        message.vulnerability,
        message.hands,
      );
      room.engine = engine;
      db.saveBoard(engine.getState());
      rooms.broadcast(info.matchId, { type: "state", board: engine.getState() });
      return;
    }

    case "call": {
      if (!requireOperator(ws)) return;
      const info = clientInfo.get(ws)!;
      const room = rooms.getRoom(info.matchId);
      if (!room?.engine) {
        sendError(ws, "No board loaded");
        return;
      }

      const result = room.engine.makeCall(message.seat, message.call);
      if (!result.success) {
        sendError(ws, result.error!);
        return;
      }

      rooms.broadcast(info.matchId, {
        type: "call_made",
        seat: message.seat,
        call: message.call,
      });

      if (result.auctionComplete) {
        if (result.passedOut) {
          rooms.broadcast(info.matchId, {
            type: "board_complete",
            result: { declarer: "N", contract: { level: 1, denomination: "C", doubled: false, redoubled: false, declarer: "N" }, tricksMade: 0, score: 0 },
          });
        }
        // Send full state after auction completes
        rooms.broadcast(info.matchId, { type: "state", board: room.engine.getState() });
      }

      db.saveBoard(room.engine.getState());
      return;
    }

    case "play": {
      if (!requireOperator(ws)) return;
      const info = clientInfo.get(ws)!;
      const room = rooms.getRoom(info.matchId);
      if (!room?.engine) {
        sendError(ws, "No board loaded");
        return;
      }

      const result = room.engine.playCard(message.seat, message.card);
      if (!result.success) {
        sendError(ws, result.error!);
        return;
      }

      rooms.broadcast(info.matchId, {
        type: "card_played",
        seat: message.seat,
        card: message.card,
      });

      if (result.trickComplete && result.trickWinner) {
        const trickNum = room.engine.board.tricks.filter((t) => t.winner).length;
        rooms.broadcast(info.matchId, {
          type: "trick_complete",
          winner: result.trickWinner,
          trickNumber: trickNum,
        });
      }

      if (result.playComplete && room.engine.board.result) {
        rooms.broadcast(info.matchId, {
          type: "board_complete",
          result: room.engine.board.result,
        });
      }

      db.saveBoard(room.engine.getState());
      return;
    }

    case "undo": {
      if (!requireOperator(ws)) return;
      const info = clientInfo.get(ws)!;
      const room = rooms.getRoom(info.matchId);
      if (!room?.engine) {
        sendError(ws, "No board loaded");
        return;
      }

      const result = room.engine.undo();
      if (!result.success) {
        sendError(ws, result.error!);
        return;
      }

      rooms.broadcast(info.matchId, {
        type: "undo_performed",
        board: room.engine.getState(),
      });
      db.saveBoard(room.engine.getState());
      return;
    }

    case "set_result": {
      if (!requireOperator(ws)) return;
      const info = clientInfo.get(ws)!;
      const room = rooms.getRoom(info.matchId);
      if (!room?.engine) {
        sendError(ws, "No board loaded");
        return;
      }

      const result = room.engine.setResult(message.declarer, message.contract, message.tricks);
      if (!result.success) {
        sendError(ws, result.error!);
        return;
      }

      if (room.engine.board.result) {
        rooms.broadcast(info.matchId, {
          type: "board_complete",
          result: room.engine.board.result,
        });
      }
      db.saveBoard(room.engine.getState());
      return;
    }
  }
}

function requireOperator(ws: WebSocket): boolean {
  const info = clientInfo.get(ws);
  if (!info || info.role !== "operator") {
    sendError(ws, "Operator authentication required");
    return false;
  }
  return true;
}

function send(ws: WebSocket, message: OutboundMessage): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: "error", message });
}

export { clientInfo };
