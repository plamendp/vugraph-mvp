import type {
  BoardPhase,
  BoardResult,
  BoardState,
  Call,
  Card,
  Seat,
  Vulnerability,
} from "../engine/types.js";

// ── Inbound (client → server) ──

export interface AuthMessage {
  type: "auth";
  token: string;
  role: "operator" | "spectator";
  matchId: string;
}

export interface LoadBoardMessage {
  type: "load_board";
  matchId: string;
  boardNumber: number;
  dealer: Seat;
  vulnerability: Vulnerability;
  hands: Record<Seat, Card[]>;
}

export interface CallMessage {
  type: "call";
  seat: Seat;
  call: Call;
}

export interface PlayMessage {
  type: "play";
  seat: Seat;
  card: Card;
}

export interface UndoMessage {
  type: "undo";
}

export interface SetResultMessage {
  type: "set_result";
  declarer: Seat;
  contract: string;
  tricks: number;
}

export type InboundMessage =
  | AuthMessage
  | LoadBoardMessage
  | CallMessage
  | PlayMessage
  | UndoMessage
  | SetResultMessage;

// ── Outbound (server → client) ──

export interface StateMessage {
  type: "state";
  board: BoardState;
}

export interface CallMadeMessage {
  type: "call_made";
  seat: Seat;
  call: Call;
}

export interface CardPlayedMessage {
  type: "card_played";
  seat: Seat;
  card: Card;
}

export interface TrickCompleteMessage {
  type: "trick_complete";
  winner: Seat;
  trickNumber: number;
}

export interface BoardCompleteMessage {
  type: "board_complete";
  result: BoardResult;
}

export interface UndoPerformedMessage {
  type: "undo_performed";
  board: BoardState;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type OutboundMessage =
  | StateMessage
  | CallMadeMessage
  | CardPlayedMessage
  | TrickCompleteMessage
  | BoardCompleteMessage
  | UndoPerformedMessage
  | ErrorMessage;

// ── Parsing ──

const VALID_SEATS = new Set(["N", "E", "S", "W"]);
const VALID_TYPES = new Set([
  "auth", "load_board", "call", "play", "undo", "set_result",
]);

export function parseInboundMessage(raw: string): InboundMessage {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON");
  }

  if (!data || typeof data !== "object" || !VALID_TYPES.has(data.type)) {
    throw new Error(`Invalid or missing message type: ${data?.type}`);
  }

  switch (data.type) {
    case "auth":
      if (typeof data.token !== "string") throw new Error("Missing token");
      if (data.role !== "operator" && data.role !== "spectator") throw new Error("Invalid role");
      if (typeof data.matchId !== "string") throw new Error("Missing matchId");
      return data as AuthMessage;

    case "load_board":
      if (typeof data.matchId !== "string") throw new Error("Missing matchId");
      if (typeof data.boardNumber !== "number") throw new Error("Missing boardNumber");
      if (!VALID_SEATS.has(data.dealer)) throw new Error("Invalid dealer");
      if (!data.hands || typeof data.hands !== "object") throw new Error("Missing hands");
      return data as LoadBoardMessage;

    case "call":
      if (!VALID_SEATS.has(data.seat)) throw new Error("Invalid seat");
      if (typeof data.call !== "string") throw new Error("Missing call");
      return data as CallMessage;

    case "play":
      if (!VALID_SEATS.has(data.seat)) throw new Error("Invalid seat");
      if (typeof data.card !== "string") throw new Error("Missing card");
      return data as PlayMessage;

    case "undo":
      return data as UndoMessage;

    case "set_result":
      if (!VALID_SEATS.has(data.declarer)) throw new Error("Invalid declarer");
      if (typeof data.contract !== "string") throw new Error("Missing contract");
      if (typeof data.tricks !== "number") throw new Error("Missing tricks");
      return data as SetResultMessage;

    default:
      throw new Error(`Unknown message type: ${data.type}`);
  }
}
