import type { WebSocket } from "ws";
import type { MatchEngine } from "../engine/match-engine.js";
import type { OutboundMessage } from "./protocol.js";

export interface Room {
  matchId: string;
  operator: WebSocket | null;
  spectators: Set<WebSocket>;
  engine: MatchEngine | null;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  getOrCreateRoom(matchId: string): Room {
    let room = this.rooms.get(matchId);
    if (!room) {
      room = { matchId, operator: null, spectators: new Set(), engine: null };
      this.rooms.set(matchId, room);
    }
    return room;
  }

  getRoom(matchId: string): Room | undefined {
    return this.rooms.get(matchId);
  }

  joinRoom(matchId: string, ws: WebSocket, role: "operator" | "spectator"): Room {
    const room = this.getOrCreateRoom(matchId);
    if (role === "operator") {
      room.operator = ws;
    } else {
      room.spectators.add(ws);
    }
    return room;
  }

  leaveRoom(matchId: string, ws: WebSocket): void {
    const room = this.rooms.get(matchId);
    if (!room) return;
    if (room.operator === ws) room.operator = null;
    room.spectators.delete(ws);
  }

  broadcast(matchId: string, message: OutboundMessage): void {
    const room = this.rooms.get(matchId);
    if (!room) return;
    const payload = JSON.stringify(message);
    if (room.operator?.readyState === 1) room.operator.send(payload);
    for (const ws of room.spectators) {
      if (ws.readyState === 1) ws.send(payload);
    }
  }

  sendToOperator(matchId: string, message: OutboundMessage): void {
    const room = this.rooms.get(matchId);
    if (room?.operator?.readyState === 1) {
      room.operator.send(JSON.stringify(message));
    }
  }

  removeDisconnected(ws: WebSocket): void {
    for (const room of this.rooms.values()) {
      if (room.operator === ws) room.operator = null;
      room.spectators.delete(ws);
    }
  }
}
