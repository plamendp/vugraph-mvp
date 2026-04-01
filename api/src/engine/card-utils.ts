import type {
  Bid,
  BidLevel,
  Call,
  Card,
  Denomination,
  Rank,
  Seat,
  Suit,
  Vulnerability,
} from "./types.js";
import {
  DENOMINATION_ORDER,
  RANK_ORDER,
  SEAT_ORDER,
  VULNERABILITY_TABLE,
} from "./types.js";

const VALID_SUITS = new Set<string>(["S", "H", "D", "C"]);
const VALID_RANKS = new Set<string>(RANK_ORDER);
const VALID_DENOMINATIONS = new Set<string>(DENOMINATION_ORDER);

// ── Card helpers ──

export function parseSuit(card: Card): Suit {
  return card[0] as Suit;
}

export function parseRank(card: Card): Rank {
  return card[1] as Rank;
}

export function isValidCard(s: string): s is Card {
  return s.length === 2 && VALID_SUITS.has(s[0]) && VALID_RANKS.has(s[1]);
}

export function rankValue(rank: Rank): number {
  return RANK_ORDER.indexOf(rank);
}

// ── Call / Bid helpers ──

export function isValidCall(s: string): s is Call {
  if (s === "P" || s === "X" || s === "XX") return true;
  return isBid(s);
}

export function isBid(s: string): s is Bid {
  if (s.length < 2 || s.length > 3) return false;
  const level = parseInt(s[0], 10);
  if (level < 1 || level > 7) return false;
  const denom = s.slice(1);
  return VALID_DENOMINATIONS.has(denom);
}

export function parseBid(call: Call): { level: BidLevel; denomination: Denomination } | null {
  if (call === "P" || call === "X" || call === "XX") return null;
  return {
    level: parseInt(call[0], 10) as BidLevel,
    denomination: call.slice(1) as Denomination,
  };
}

export function bidValue(bid: Bid): number {
  const level = parseInt(bid[0], 10);
  const denom = bid.slice(1) as Denomination;
  return (level - 1) * 5 + DENOMINATION_ORDER.indexOf(denom);
}

export function isBidHigher(a: Bid, b: Bid): boolean {
  return bidValue(a) > bidValue(b);
}

// ── Seat helpers ──

export function nextSeat(seat: Seat): Seat {
  return SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + 1) % 4];
}

export function partnerOf(seat: Seat): Seat {
  return SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + 2) % 4];
}

export function isOpponent(a: Seat, b: Seat): boolean {
  return partnerOf(a) !== b && a !== b;
}

export function sameSide(a: Seat, b: Seat): boolean {
  return a === b || partnerOf(a) === b;
}

// ── Board metadata ──

export function getVulnerability(boardNumber: number): Vulnerability {
  return VULNERABILITY_TABLE[(boardNumber - 1) % 16];
}

export function getDealer(boardNumber: number): Seat {
  return SEAT_ORDER[(boardNumber - 1) % 4];
}

/** Convert denomination to trump suit (null for NT). */
export function trumpSuit(denomination: Denomination): Suit | null {
  if (denomination === "NT") return null;
  return denomination as Suit;
}
