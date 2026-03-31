import type {
  AuctionEntry,
  Bid,
  Call,
  Contract,
  Seat,
} from "./types.js";
import { DENOMINATION_ORDER, SEAT_ORDER } from "./types.js";
import { bidValue, isBid, isOpponent, parseBid, sameSide } from "./card-utils.js";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Determine whose turn it is given the dealer and number of calls made.
 */
export function currentTurnSeat(dealer: Seat, callCount: number): Seat {
  return SEAT_ORDER[(SEAT_ORDER.indexOf(dealer) + callCount) % 4];
}

/**
 * Validate whether a call is legal given the current auction state.
 */
export function validateCall(
  auction: AuctionEntry[],
  call: Call,
  seat: Seat,
  dealer: Seat,
): ValidationResult {
  // Auction already complete?
  if (isAuctionComplete(auction)) {
    return { valid: false, error: "Auction is already complete" };
  }

  // Turn check
  const expected = currentTurnSeat(dealer, auction.length);
  if (seat !== expected) {
    return { valid: false, error: `Not ${seat}'s turn; expected ${expected}` };
  }

  // Pass is always valid
  if (call === "P") {
    return { valid: true };
  }

  // Bid
  if (isBid(call)) {
    const lastBid = findLastBid(auction);
    if (lastBid !== null && bidValue(call) <= bidValue(lastBid)) {
      return { valid: false, error: `Bid ${call} is not higher than ${lastBid}` };
    }
    return { valid: true };
  }

  // Double
  if (call === "X") {
    const lastNonPass = findLastNonPass(auction);
    if (lastNonPass === null) {
      return { valid: false, error: "Cannot double: no bids made" };
    }
    if (!isBid(lastNonPass.call)) {
      return { valid: false, error: "Cannot double: last non-pass call is not a bid" };
    }
    if (!isOpponent(seat, lastNonPass.seat)) {
      return { valid: false, error: "Cannot double your own side's bid" };
    }
    return { valid: true };
  }

  // Redouble
  if (call === "XX") {
    const lastNonPass = findLastNonPass(auction);
    if (lastNonPass === null) {
      return { valid: false, error: "Cannot redouble: no calls made" };
    }
    if (lastNonPass.call !== "X") {
      return { valid: false, error: "Cannot redouble: last non-pass call is not a double" };
    }
    if (!isOpponent(seat, lastNonPass.seat)) {
      return { valid: false, error: "Cannot redouble your opponent's double" };
    }
    return { valid: true };
  }

  return { valid: false, error: `Unknown call: ${call}` };
}

/**
 * Check if the auction is complete.
 * Complete when: 4 passes (passed out) or 3 passes after at least one non-pass call.
 */
export function isAuctionComplete(auction: AuctionEntry[]): boolean {
  if (auction.length < 4) return false;

  // Count trailing passes
  let trailingPasses = 0;
  for (let i = auction.length - 1; i >= 0; i--) {
    if (auction[i].call === "P") trailingPasses++;
    else break;
  }

  // All 4 passes = passed out
  if (auction.length === 4 && trailingPasses === 4) return true;

  // At least one non-pass call exists and 3 trailing passes
  const hasNonPass = auction.some((e) => e.call !== "P");
  return hasNonPass && trailingPasses >= 3;
}

/**
 * Determine the contract from a completed auction.
 * Returns null if the board was passed out.
 */
export function determineContract(
  auction: AuctionEntry[],
): { contract: Contract; declarer: Seat; dummy: Seat } | null {
  const lastBidEntry = findLastBidEntry(auction);
  if (lastBidEntry === null) return null; // passed out

  const parsed = parseBid(lastBidEntry.call as Bid)!;
  const finalBidder = lastBidEntry.seat;

  // Check for double/redouble after the last bid
  let doubled = false;
  let redoubled = false;
  const lastBidIndex = auction.lastIndexOf(lastBidEntry);
  for (let i = lastBidIndex + 1; i < auction.length; i++) {
    if (auction[i].call === "X") doubled = true;
    if (auction[i].call === "XX") {
      doubled = false;
      redoubled = true;
    }
  }

  // Declarer: first player of the winning partnership to bid this denomination
  let declarer: Seat = finalBidder;
  for (const entry of auction) {
    if (sameSide(entry.seat, finalBidder)) {
      const entryParsed = parseBid(entry.call as Call);
      if (entryParsed && entryParsed.denomination === parsed.denomination) {
        declarer = entry.seat;
        break;
      }
    }
  }

  const dummy = SEAT_ORDER[(SEAT_ORDER.indexOf(declarer) + 2) % 4];

  return {
    contract: {
      level: parsed.level,
      denomination: parsed.denomination,
      doubled,
      redoubled,
      declarer,
    },
    declarer,
    dummy,
  };
}

// ── Helpers ──

function findLastBid(auction: AuctionEntry[]): Bid | null {
  for (let i = auction.length - 1; i >= 0; i--) {
    if (isBid(auction[i].call)) return auction[i].call as Bid;
  }
  return null;
}

function findLastBidEntry(auction: AuctionEntry[]): AuctionEntry | null {
  for (let i = auction.length - 1; i >= 0; i--) {
    if (isBid(auction[i].call)) return auction[i];
  }
  return null;
}

function findLastNonPass(auction: AuctionEntry[]): AuctionEntry | null {
  for (let i = auction.length - 1; i >= 0; i--) {
    if (auction[i].call !== "P") return auction[i];
  }
  return null;
}
