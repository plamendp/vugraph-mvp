// Single source of truth: @vugraph/types
// Re-exported so existing imports within api/ continue to work unchanged.
export {
  type Seat, type Suit, type Rank, type Card, type Vulnerability,
  type Denomination, type BidLevel, type Bid, type Call,
  type BoardPhase, type MatchStatus,
  type AuctionEntry, type PlayEntry, type Trick, type Contract,
  type BoardResult, type BoardState, type Match, type UndoAction,
  SEAT_ORDER, DENOMINATION_ORDER, RANK_ORDER, VULNERABILITY_TABLE,
} from "../../../packages/types/src/engine.js";
