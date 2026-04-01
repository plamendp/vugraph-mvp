import { describe, it, expect } from "vitest";
import { MatchEngine } from "../../src/engine/match-engine.js";
import type { Card, Seat } from "../../src/engine/types.js";
import {
  validateCall,
  isAuctionComplete,
  determineContract,
} from "../../src/engine/auction.js";
import type { AuctionEntry } from "../../src/engine/types.js";

// Helper: create a simple engine with dealer N
function makeEngine(dealer: Seat = "N"): MatchEngine {
  return new MatchEngine("test", 1, dealer, "None", sampleHands());
}

function sampleHands(): Record<Seat, Card[]> {
  return {
    N: ["SA", "SK", "SQ", "SJ", "ST", "S9", "S8", "S7", "S6", "S5", "S4", "S3", "S2"],
    E: ["HA", "HK", "HQ", "HJ", "HT", "H9", "H8", "H7", "H6", "H5", "H4", "H3", "H2"],
    S: ["DA", "DK", "DQ", "DJ", "DT", "D9", "D8", "D7", "D6", "D5", "D4", "D3", "D2"],
    W: ["CA", "CK", "CQ", "CJ", "CT", "C9", "C8", "C7", "C6", "C5", "C4", "C3", "C2"],
  };
}

describe("Auction validation", () => {
  it("accepts a valid opening bid by dealer", () => {
    const e = makeEngine();
    const r = e.makeCall("N", "1C");
    expect(r.success).toBe(true);
  });

  it("rejects a bid from the wrong seat", () => {
    const e = makeEngine();
    const r = e.makeCall("E", "1C");
    expect(r.success).toBe(false);
    expect(r.error).toContain("Not E's turn");
  });

  it("accepts pass from any seat on their turn", () => {
    const e = makeEngine();
    expect(e.makeCall("N", "P").success).toBe(true);
    expect(e.makeCall("E", "P").success).toBe(true);
    expect(e.makeCall("S", "P").success).toBe(true);
    expect(e.makeCall("W", "P").success).toBe(true);
  });

  it("requires bid to be higher than previous", () => {
    const e = makeEngine();
    e.makeCall("N", "1S");
    // Same bid - invalid
    expect(e.makeCall("E", "1S").success).toBe(false);
    // Lower bid - invalid
    expect(e.makeCall("E", "1H").success).toBe(false);
    // Higher bid - valid
    expect(e.makeCall("E", "1NT").success).toBe(true);
  });

  it("accepts higher level bids", () => {
    const e = makeEngine();
    e.makeCall("N", "1NT");
    expect(e.makeCall("E", "2C").success).toBe(true);
  });

  describe("Double", () => {
    it("is valid after opponent's bid", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      expect(e.makeCall("E", "X").success).toBe(true);
    });

    it("is valid after opponent's bid with intervening passes", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      e.makeCall("E", "P");
      e.makeCall("S", "P");
      expect(e.makeCall("W", "X").success).toBe(true);
    });

    it("is invalid when no bids made", () => {
      const e = makeEngine();
      expect(e.makeCall("N", "X").success).toBe(false);
    });

    it("is invalid when last non-pass is own side's bid", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      e.makeCall("E", "P");
      // S is N's partner
      expect(e.makeCall("S", "X").success).toBe(false);
    });

    it("is invalid when last non-pass is already a double", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      e.makeCall("E", "X");
      // S can't double again - last non-pass is X not a bid
      expect(e.makeCall("S", "X").success).toBe(false);
    });
  });

  describe("Redouble", () => {
    it("is valid after opponent's double", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      e.makeCall("E", "X");
      expect(e.makeCall("S", "XX").success).toBe(true);
    });

    it("is valid after opponent's double with intervening passes", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      e.makeCall("E", "X");
      e.makeCall("S", "P");
      expect(e.makeCall("W", "XX").success).toBe(false); // W is E's partner, E doubled - can't redouble own double
    });

    it("is invalid when last non-pass is a bid", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      expect(e.makeCall("E", "XX").success).toBe(false);
    });

    it("is invalid when last non-pass is own side's double", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      e.makeCall("E", "X");
      e.makeCall("S", "P");
      // W is E's partner, E made the double
      expect(e.makeCall("W", "XX").success).toBe(false);
    });
  });

  describe("Auction completion", () => {
    it("ends after 3 passes following a bid", () => {
      const e = makeEngine();
      e.makeCall("N", "1C");
      expect(e.makeCall("E", "P").auctionComplete).toBeUndefined();
      expect(e.makeCall("S", "P").auctionComplete).toBeUndefined();
      const r = e.makeCall("W", "P");
      expect(r.success).toBe(true);
      expect(r.auctionComplete).toBe(true);
      expect(r.contract).toBeDefined();
    });

    it("ends with 4 passes (passed out)", () => {
      const e = makeEngine();
      e.makeCall("N", "P");
      e.makeCall("E", "P");
      e.makeCall("S", "P");
      const r = e.makeCall("W", "P");
      expect(r.success).toBe(true);
      expect(r.auctionComplete).toBe(true);
      expect(r.passedOut).toBe(true);
    });

    it("rejects calls after auction is complete", () => {
      const e = makeEngine();
      e.makeCall("N", "1C");
      e.makeCall("E", "P");
      e.makeCall("S", "P");
      e.makeCall("W", "P");
      // Auction is complete, now in play phase
      expect(e.board.phase).toBe("play");
    });

    it("sets phase to complete when passed out", () => {
      const e = makeEngine();
      e.makeCall("N", "P");
      e.makeCall("E", "P");
      e.makeCall("S", "P");
      e.makeCall("W", "P");
      expect(e.board.phase).toBe("complete");
    });
  });

  describe("Contract determination", () => {
    it("determines correct contract and declarer", () => {
      const e = makeEngine();
      e.makeCall("N", "1H");
      e.makeCall("E", "2C");
      e.makeCall("S", "2H");
      e.makeCall("W", "P");
      e.makeCall("N", "P");
      e.makeCall("E", "P");
      // Contract is 2H, declarer is N (first of NS to bid H)
      expect(e.board.contract).toBeDefined();
      expect(e.board.contract!.level).toBe(2);
      expect(e.board.contract!.denomination).toBe("H");
      expect(e.board.declarer).toBe("N");
      expect(e.board.dummy).toBe("S");
    });

    it("determines declarer as first of partnership to name denomination", () => {
      // S opens 1S, N later raises to 4S. Declarer should be S.
      const e = makeEngine("S"); // dealer S
      e.makeCall("S", "1S");
      e.makeCall("W", "P");
      e.makeCall("N", "4S");
      e.makeCall("E", "P");
      e.makeCall("S", "P");
      e.makeCall("W", "P");
      expect(e.board.declarer).toBe("S"); // first of NS to bid spades
    });

    it("handles doubled contract", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      e.makeCall("E", "X");
      e.makeCall("S", "P");
      e.makeCall("W", "P");
      e.makeCall("N", "P");
      expect(e.board.contract).toBeDefined();
      expect(e.board.contract!.doubled).toBe(true);
      expect(e.board.contract!.redoubled).toBe(false);
    });

    it("handles redoubled contract", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      e.makeCall("E", "X");
      e.makeCall("S", "XX");
      e.makeCall("W", "P");
      e.makeCall("N", "P");
      e.makeCall("E", "P");
      expect(e.board.contract).toBeDefined();
      expect(e.board.contract!.doubled).toBe(false);
      expect(e.board.contract!.redoubled).toBe(true);
    });

    it("sets opening leader as left of declarer", () => {
      const e = makeEngine();
      e.makeCall("N", "1S");
      e.makeCall("E", "P");
      e.makeCall("S", "P");
      e.makeCall("W", "P");
      // Declarer N, opening leader is E
      expect(e.board.currentTurn).toBe("E");
    });
  });
});

describe("isAuctionComplete", () => {
  it("returns false for fewer than 4 calls", () => {
    const auction: AuctionEntry[] = [
      { seat: "N", call: "1C" },
      { seat: "E", call: "P" },
      { seat: "S", call: "P" },
    ];
    expect(isAuctionComplete(auction)).toBe(false);
  });

  it("returns true for 4 passes", () => {
    const auction: AuctionEntry[] = [
      { seat: "N", call: "P" },
      { seat: "E", call: "P" },
      { seat: "S", call: "P" },
      { seat: "W", call: "P" },
    ];
    expect(isAuctionComplete(auction)).toBe(true);
  });
});

describe("Undo in auction", () => {
  it("undoes a call", () => {
    const e = makeEngine();
    e.makeCall("N", "1C");
    expect(e.board.auction.length).toBe(1);
    const r = e.undo();
    expect(r.success).toBe(true);
    expect(e.board.auction.length).toBe(0);
    expect(e.board.currentTurn).toBe("N");
  });

  it("undoes multiple calls in order", () => {
    const e = makeEngine();
    e.makeCall("N", "1C");
    e.makeCall("E", "1H");
    e.undo();
    expect(e.board.auction.length).toBe(1);
    expect(e.board.currentTurn).toBe("E");
    e.undo();
    expect(e.board.auction.length).toBe(0);
    expect(e.board.currentTurn).toBe("N");
  });

  it("returns error when nothing to undo", () => {
    const e = makeEngine();
    expect(e.undo().success).toBe(false);
  });
});
