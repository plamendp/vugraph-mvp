// ── Primitives ──

export type Seat = "N" | "E" | "S" | "W";
export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "A" | "K" | "Q" | "J" | "T"
  | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
export type Card = `${Suit}${Rank}`;
export type Vulnerability = "None" | "NS" | "EW" | "All";
export type Denomination = "C" | "D" | "H" | "S" | "NT";
export type BidLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Bid = `${BidLevel}${Denomination}`;
export type Call = "P" | "X" | "XX" | Bid;
export type BoardPhase = "setup" | "auction" | "play" | "complete";
export type MatchStatus = "pending" | "live" | "complete";

// ── Auction ──

export interface AuctionEntry {
  seat: Seat;
  call: Call;
}

// ── Play ──

export interface PlayEntry {
  seat: Seat;
  card: Card;
  trickNumber: number;
}

export interface Trick {
  number: number;
  cards: PlayEntry[];
  leader: Seat;
  winner?: Seat;
}

// ── Contract & Result ──

export interface Contract {
  level: BidLevel;
  denomination: Denomination;
  doubled: boolean;
  redoubled: boolean;
  declarer: Seat;
}

export interface BoardResult {
  declarer: Seat;
  contract: Contract;
  tricksMade: number;
  score: number;
}

// ── Board State ──

export interface BoardState {
  matchId: string;
  boardNumber: number;
  dealer: Seat;
  vulnerability: Vulnerability;
  hands: Record<Seat, Card[]>;
  phase: BoardPhase;
  auction: AuctionEntry[];
  play: PlayEntry[];
  tricks: Trick[];
  contract?: Contract;
  declarer?: Seat;
  dummy?: Seat;
  currentTurn?: Seat;
  result?: BoardResult;
}

// ── Match ──

export interface Match {
  id: string;
  title: string;
  segment: string;
  homeTeam: string;
  awayTeam: string;
  status: MatchStatus;
  createdAt: string;
}

// ── Undo ──

export interface UndoAction {
  type: "call" | "play";
  entry: AuctionEntry | PlayEntry;
  previousPhase: BoardPhase;
  previousTurn?: Seat;
  previousContract?: Contract;
  previousDeclarer?: Seat;
  previousDummy?: Seat;
  removedTrick?: boolean; // true if undoing the first card of a trick removed the trick
}

// ── Constants ──

export const SEAT_ORDER: Seat[] = ["N", "E", "S", "W"];

export const DENOMINATION_ORDER: Denomination[] = ["C", "D", "H", "S", "NT"];

export const RANK_ORDER: Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A",
];

/** Vulnerability for boards 1–16 (index 0–15). Use (boardNumber-1)%16. */
export const VULNERABILITY_TABLE: Vulnerability[] = [
  "None", "NS", "EW", "All",  // boards 1-4
  "NS",   "EW", "All", "None", // boards 5-8
  "EW",   "All", "None", "NS", // boards 9-12
  "All",  "None", "NS", "EW",  // boards 13-16
];
