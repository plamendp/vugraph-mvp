import type {
  AuctionEntry,
  Bid,
  BidLevel,
  BoardPhase,
  BoardResult,
  BoardState,
  Call,
  Card,
  Contract,
  Denomination,
  PlayEntry,
  Seat,
  Trick,
  UndoAction,
  Vulnerability,
} from "./types.js";
import { nextSeat, parseBid, trumpSuit } from "./card-utils.js";
import { currentTurnSeat, determineContract, isAuctionComplete, validateCall } from "./auction.js";
import { determineTrickWinner, getCurrentTrick, validatePlay } from "./play.js";
import { calculateScore } from "./scoring.js";

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface CallResult extends ActionResult {
  auctionComplete?: boolean;
  contract?: Contract;
  passedOut?: boolean;
}

export interface PlayResult extends ActionResult {
  trickComplete?: boolean;
  trickWinner?: Seat;
  playComplete?: boolean;
}

export interface UndoResult extends ActionResult {
  undoneAction?: UndoAction;
}

export class MatchEngine {
  board: BoardState;
  undoStack: UndoAction[] = [];

  constructor(
    matchId: string,
    boardNumber: number,
    dealer: Seat,
    vulnerability: Vulnerability,
    hands: Record<Seat, Card[]>,
  ) {
    this.board = {
      matchId,
      boardNumber,
      dealer,
      vulnerability,
      hands: {
        N: [...hands.N],
        E: [...hands.E],
        S: [...hands.S],
        W: [...hands.W],
      },
      phase: "auction",
      auction: [],
      play: [],
      tricks: [],
      currentTurn: dealer,
    };
  }

  makeCall(seat: Seat, call: Call): CallResult {
    if (this.board.phase !== "auction") {
      return { success: false, error: "Not in auction phase" };
    }

    const validation = validateCall(this.board.auction, call, seat, this.board.dealer);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Snapshot state for undo
    const undoAction: UndoAction = {
      type: "call",
      entry: { seat, call },
      previousPhase: this.board.phase,
      previousTurn: this.board.currentTurn,
      previousContract: this.board.contract ? { ...this.board.contract } : undefined,
      previousDeclarer: this.board.declarer,
      previousDummy: this.board.dummy,
    };

    // Apply the call
    this.board.auction.push({ seat, call });
    this.board.currentTurn = currentTurnSeat(this.board.dealer, this.board.auction.length);

    // Check if auction is complete
    if (isAuctionComplete(this.board.auction)) {
      const result = determineContract(this.board.auction);
      if (result === null) {
        // Passed out
        this.board.phase = "complete";
        this.board.currentTurn = undefined;
        this.undoStack.push(undoAction);
        return { success: true, auctionComplete: true, passedOut: true };
      }

      this.board.contract = result.contract;
      this.board.declarer = result.declarer;
      this.board.dummy = result.dummy;
      this.board.phase = "play";
      this.board.currentTurn = nextSeat(result.declarer); // opening leader
      this.undoStack.push(undoAction);
      return { success: true, auctionComplete: true, contract: result.contract };
    }

    this.undoStack.push(undoAction);
    return { success: true };
  }

  playCard(seat: Seat, card: Card): PlayResult {
    const validation = validatePlay(this.board, seat, card);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Determine current trick
    let trick = getCurrentTrick(this.board);
    let removedTrick = false;
    if (trick === null) {
      // Start a new trick
      const trickNumber = this.board.tricks.length + 1;
      trick = { number: trickNumber, cards: [], leader: seat };
      this.board.tricks.push(trick);
    }

    // Snapshot for undo
    const undoAction: UndoAction = {
      type: "play",
      entry: { seat, card, trickNumber: trick.number },
      previousPhase: this.board.phase,
      previousTurn: this.board.currentTurn,
    };

    // Apply the play
    const playEntry: PlayEntry = { seat, card, trickNumber: trick.number };
    this.board.play.push(playEntry);
    trick.cards.push(playEntry);

    // Remove card from hand
    const handIdx = this.board.hands[seat].indexOf(card);
    this.board.hands[seat].splice(handIdx, 1);

    // Check if trick is complete
    if (trick.cards.length === 4) {
      const trump = this.board.contract ? trumpSuit(this.board.contract.denomination) : null;
      const winner = determineTrickWinner(trick, trump);
      trick.winner = winner;

      // Check if play is complete (13 tricks)
      if (this.board.tricks.length === 13) {
        this.board.phase = "complete";
        this.board.currentTurn = undefined;
        this.computeResult();
        this.undoStack.push(undoAction);
        return { success: true, trickComplete: true, trickWinner: winner, playComplete: true };
      }

      this.board.currentTurn = winner;
      this.undoStack.push(undoAction);
      return { success: true, trickComplete: true, trickWinner: winner };
    }

    this.board.currentTurn = nextSeat(seat);
    this.undoStack.push(undoAction);
    return { success: true };
  }

  undo(): UndoResult {
    const action = this.undoStack.pop();
    if (!action) {
      return { success: false, error: "Nothing to undo" };
    }

    if (action.type === "call") {
      // Remove last auction entry
      this.board.auction.pop();
      this.board.phase = action.previousPhase;
      this.board.currentTurn = action.previousTurn;
      this.board.contract = action.previousContract;
      this.board.declarer = action.previousDeclarer;
      this.board.dummy = action.previousDummy;
      // Clear play state if we're reverting from play to auction
      if (action.previousPhase === "auction" && this.board.tricks.length > 0) {
        this.board.tricks = [];
        this.board.play = [];
      }
      this.board.result = undefined;
      return { success: true, undoneAction: action };
    }

    if (action.type === "play") {
      const entry = action.entry as PlayEntry;
      // Remove last play entry
      this.board.play.pop();
      // Restore card to hand
      this.board.hands[entry.seat].push(entry.card);
      // Remove from trick
      const lastTrick = this.board.tricks[this.board.tricks.length - 1];
      if (lastTrick) {
        lastTrick.cards.pop();
        lastTrick.winner = undefined;
        if (lastTrick.cards.length === 0) {
          this.board.tricks.pop();
        }
      }
      this.board.phase = action.previousPhase;
      this.board.currentTurn = action.previousTurn;
      this.board.result = undefined;
      return { success: true, undoneAction: action };
    }

    return { success: false, error: "Unknown undo action type" };
  }

  setResult(declarer: Seat, contractStr: string, tricks: number): ActionResult {
    const parsed = parseBid(contractStr as Call);
    if (!parsed) {
      return { success: false, error: `Invalid contract: ${contractStr}` };
    }

    const contract: Contract = {
      level: parsed.level,
      denomination: parsed.denomination,
      doubled: false,
      redoubled: false,
      declarer,
    };

    const score = calculateScore(contract, this.board.vulnerability, tricks);
    this.board.result = { declarer, contract, tricksMade: tricks, score };
    this.board.phase = "complete";
    this.board.currentTurn = undefined;
    return { success: true };
  }

  getState(): BoardState {
    return structuredClone(this.board);
  }

  private computeResult(): void {
    if (!this.board.contract || !this.board.declarer) return;

    let declarerTricks = 0;
    for (const trick of this.board.tricks) {
      if (!trick.winner) continue;
      if (
        trick.winner === this.board.declarer ||
        trick.winner === nextSeat(nextSeat(this.board.declarer))
      ) {
        declarerTricks++;
      }
    }

    const score = calculateScore(this.board.contract, this.board.vulnerability, declarerTricks);
    this.board.result = {
      declarer: this.board.declarer,
      contract: this.board.contract,
      tricksMade: declarerTricks,
      score,
    };
  }
}
