import type { BoardState, Card, PlayEntry, Seat, Suit, Trick } from "./types.js";
import { nextSeat, parseSuit, rankValue, trumpSuit } from "./card-utils.js";

export interface PlayValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate whether a card play is legal.
 */
export function validatePlay(
  board: BoardState,
  seat: Seat,
  card: Card,
): PlayValidationResult {
  if (board.phase !== "play") {
    return { valid: false, error: "Board is not in play phase" };
  }

  if (seat !== board.currentTurn) {
    return { valid: false, error: `Not ${seat}'s turn; expected ${board.currentTurn}` };
  }

  // Card must be in hand
  if (!board.hands[seat].includes(card)) {
    return { valid: false, error: `${seat} does not hold ${card}` };
  }

  // Follow suit rule
  const currentTrick = getCurrentTrick(board);
  if (currentTrick && currentTrick.cards.length > 0) {
    const ledSuit = parseSuit(currentTrick.cards[0].card);
    const playedSuit = parseSuit(card);
    if (playedSuit !== ledSuit) {
      // Check if player has any cards of the led suit
      const hasLedSuit = board.hands[seat].some((c) => parseSuit(c) === ledSuit);
      if (hasLedSuit) {
        return { valid: false, error: `Must follow suit (${ledSuit})` };
      }
    }
  }

  return { valid: true };
}

/**
 * Determine the winner of a completed trick.
 */
export function determineTrickWinner(trick: Trick, trump: Suit | null): Seat {
  const ledSuit = parseSuit(trick.cards[0].card);

  let winningEntry = trick.cards[0];
  let winningRank = rankValue(trick.cards[0].card[1] as any);
  let winnerPlayedTrump = trump !== null && parseSuit(trick.cards[0].card) === trump;

  for (let i = 1; i < trick.cards.length; i++) {
    const entry = trick.cards[i];
    const suit = parseSuit(entry.card);
    const rank = rankValue(entry.card[1] as any);
    const isTrump = trump !== null && suit === trump;

    if (isTrump && !winnerPlayedTrump) {
      // Trump beats non-trump
      winningEntry = entry;
      winningRank = rank;
      winnerPlayedTrump = true;
    } else if (isTrump && winnerPlayedTrump && rank > winningRank) {
      // Higher trump beats lower trump
      winningEntry = entry;
      winningRank = rank;
    } else if (!isTrump && !winnerPlayedTrump && suit === ledSuit && rank > winningRank) {
      // Higher card of led suit (no trumps in play)
      winningEntry = entry;
      winningRank = rank;
    }
    // Cards of non-led, non-trump suits never win
  }

  return winningEntry.seat;
}

/**
 * Get the current (incomplete) trick, or null if no tricks or last trick is complete.
 */
export function getCurrentTrick(board: BoardState): Trick | null {
  if (board.tricks.length === 0) return null;
  const last = board.tricks[board.tricks.length - 1];
  if (last.cards.length >= 4) return null; // trick is complete
  return last;
}

/**
 * Count tricks won by each side.
 */
export function trickCount(board: BoardState): { ns: number; ew: number } {
  let ns = 0;
  let ew = 0;
  for (const trick of board.tricks) {
    if (!trick.winner) continue;
    if (trick.winner === "N" || trick.winner === "S") ns++;
    else ew++;
  }
  return { ns, ew };
}
