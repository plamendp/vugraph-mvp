import { describe, it, expect, beforeEach } from "vitest";
import { MatchEngine } from "../../src/engine/match-engine.js";
import type { Card, Seat } from "../../src/engine/types.js";
import { determineTrickWinner } from "../../src/engine/play.js";
import type { Trick } from "../../src/engine/types.js";

// Hands designed for testing play:
// N: all spades, E: all hearts, S: all diamonds, W: all clubs
function sampleHands(): Record<Seat, Card[]> {
  return {
    N: ["SA", "SK", "SQ", "SJ", "ST", "S9", "S8", "S7", "S6", "S5", "S4", "S3", "S2"],
    E: ["HA", "HK", "HQ", "HJ", "HT", "H9", "H8", "H7", "H6", "H5", "H4", "H3", "H2"],
    S: ["DA", "DK", "DQ", "DJ", "DT", "D9", "D8", "D7", "D6", "D5", "D4", "D3", "D2"],
    W: ["CA", "CK", "CQ", "CJ", "CT", "C9", "C8", "C7", "C6", "C5", "C4", "C3", "C2"],
  };
}

// Mixed hands for follow-suit testing
function mixedHands(): Record<Seat, Card[]> {
  return {
    N: ["SA", "SK", "SQ", "HA", "HK", "DA", "DK", "DQ", "DJ", "CA", "CK", "CQ", "CJ"],
    E: ["SJ", "ST", "S9", "HQ", "HJ", "HT", "D9", "D8", "D7", "CT", "C9", "C8", "C7"],
    S: ["S8", "S7", "S6", "H9", "H8", "H7", "DT", "D6", "D5", "C6", "C5", "C4", "C3"],
    W: ["S5", "S4", "S3", "H6", "H5", "H4", "D4", "D3", "D2", "S2", "H3", "H2", "C2"],
  };
}

// Setup engine through auction to play phase (1NT by N, passed out, E leads)
function setupPlayPhase(hands?: Record<Seat, Card[]>): MatchEngine {
  const e = new MatchEngine("test", 1, "N", "None", hands ?? sampleHands());
  e.makeCall("N", "1NT");
  e.makeCall("E", "P");
  e.makeCall("S", "P");
  e.makeCall("W", "P");
  return e;
}

// Setup for suit contract (1S by N, E leads)
function setupSuitContract(hands?: Record<Seat, Card[]>): MatchEngine {
  const e = new MatchEngine("test", 1, "N", "None", hands ?? sampleHands());
  e.makeCall("N", "1S");
  e.makeCall("E", "P");
  e.makeCall("S", "P");
  e.makeCall("W", "P");
  return e;
}

describe("Play validation", () => {
  it("allows opening lead by player to declarer's left", () => {
    const e = setupPlayPhase();
    // Declarer is N, so E leads
    expect(e.board.phase).toBe("play");
    expect(e.board.currentTurn).toBe("E");
    const r = e.playCard("E", "HA");
    expect(r.success).toBe(true);
  });

  it("rejects play from wrong seat", () => {
    const e = setupPlayPhase();
    const r = e.playCard("N", "SA");
    expect(r.success).toBe(false);
    expect(r.error).toContain("Not N's turn");
  });

  it("rejects card not in hand", () => {
    const e = setupPlayPhase();
    const r = e.playCard("E", "SA");
    expect(r.success).toBe(false);
    expect(r.error).toContain("does not hold");
  });

  it("enforces follow suit", () => {
    const e = setupPlayPhase(mixedHands());
    // E leads SJ
    e.playCard("E", "SJ");
    // S has spades (S8, S7, S6), must follow suit
    const r = e.playCard("S", "H9");
    expect(r.success).toBe(false);
    expect(r.error).toContain("Must follow suit");
  });

  it("allows any card when void in led suit", () => {
    const e = setupPlayPhase(); // N=spades, E=hearts, S=diamonds, W=clubs
    // E leads hearts, S has no hearts (only diamonds)
    e.playCard("E", "HA");
    const r = e.playCard("S", "DA"); // can play diamond since void in hearts
    expect(r.success).toBe(true);
  });
});

describe("Trick winner determination", () => {
  it("highest of led suit wins in NT", () => {
    const trick: Trick = {
      number: 1,
      leader: "E",
      cards: [
        { seat: "E", card: "H5", trickNumber: 1 },
        { seat: "S", card: "D3", trickNumber: 1 },
        { seat: "W", card: "C2", trickNumber: 1 },
        { seat: "N", card: "H3", trickNumber: 1 },
      ],
    };
    expect(determineTrickWinner(trick, null)).toBe("E"); // H5 > H3
  });

  it("trump beats non-trump", () => {
    const trick: Trick = {
      number: 1,
      leader: "E",
      cards: [
        { seat: "E", card: "HA", trickNumber: 1 },
        { seat: "S", card: "D2", trickNumber: 1 }, // D is not trump
        { seat: "W", card: "S2", trickNumber: 1 }, // S is trump!
        { seat: "N", card: "HK", trickNumber: 1 },
      ],
    };
    // Spades trump: W's S2 beats HA
    expect(determineTrickWinner(trick, "S")).toBe("W");
  });

  it("higher trump beats lower trump", () => {
    const trick: Trick = {
      number: 1,
      leader: "E",
      cards: [
        { seat: "E", card: "HA", trickNumber: 1 },
        { seat: "S", card: "S5", trickNumber: 1 },
        { seat: "W", card: "SA", trickNumber: 1 },
        { seat: "N", card: "S3", trickNumber: 1 },
      ],
    };
    expect(determineTrickWinner(trick, "S")).toBe("W"); // SA > S5, S3
  });

  it("off-suit non-trump card never wins", () => {
    const trick: Trick = {
      number: 1,
      leader: "E",
      cards: [
        { seat: "E", card: "H3", trickNumber: 1 },
        { seat: "S", card: "DA", trickNumber: 1 }, // off-suit, no trump
        { seat: "W", card: "CA", trickNumber: 1 }, // off-suit, no trump
        { seat: "N", card: "H2", trickNumber: 1 },
      ],
    };
    // NT: only hearts count since H was led
    expect(determineTrickWinner(trick, null)).toBe("E"); // H3 > H2
  });
});

describe("Trick flow", () => {
  it("winner of trick leads next", () => {
    const e = setupPlayPhase(); // NT, E leads
    // Trick 1: E leads HA, S plays DA, W plays CA, N plays SA
    e.playCard("E", "HA");
    e.playCard("S", "DA");
    e.playCard("W", "CA");
    const r = e.playCard("N", "SA"); // SA doesn't beat HA in NT since hearts was led... wait
    // Actually in NT, led suit is H. N plays SA which is off-suit. So HA wins.
    expect(r.trickComplete).toBe(true);
    expect(r.trickWinner).toBe("E"); // HA is highest heart
    expect(e.board.currentTurn).toBe("E"); // winner leads next
  });

  it("completes play after 13 tricks", () => {
    const e = setupPlayPhase(); // NT, E leads. Each player has one suit.
    const eCards: Card[] = ["HA","HK","HQ","HJ","HT","H9","H8","H7","H6","H5","H4","H3","H2"];
    const sCards: Card[] = ["DA","DK","DQ","DJ","DT","D9","D8","D7","D6","D5","D4","D3","D2"];
    const wCards: Card[] = ["CA","CK","CQ","CJ","CT","C9","C8","C7","C6","C5","C4","C3","C2"];
    const nCards: Card[] = ["SA","SK","SQ","SJ","ST","S9","S8","S7","S6","S5","S4","S3","S2"];

    // E always leads hearts, wins every trick since others are void
    for (let i = 0; i < 13; i++) {
      e.playCard("E", eCards[i]);
      e.playCard("S", sCards[i]);
      e.playCard("W", wCards[i]);
      const r = e.playCard("N", nCards[i]);
      if (i < 12) {
        expect(r.trickComplete).toBe(true);
        expect(r.trickWinner).toBe("E"); // HA > all non-hearts in NT
        expect(r.playComplete).toBeUndefined();
      } else {
        expect(r.trickComplete).toBe(true);
        expect(r.playComplete).toBe(true);
      }
    }

    expect(e.board.phase).toBe("complete");
    expect(e.board.result).toBeDefined();
    expect(e.board.result!.tricksMade).toBe(0); // declarer (N) won 0 tricks
  });
});

describe("Play undo", () => {
  it("undoes a card play and restores it to hand", () => {
    const e = setupPlayPhase();
    e.playCard("E", "HA");
    expect(e.board.hands.E).not.toContain("HA");

    const r = e.undo();
    expect(r.success).toBe(true);
    expect(e.board.hands.E).toContain("HA");
    expect(e.board.currentTurn).toBe("E");
  });

  it("undoes across trick boundary", () => {
    const e = setupPlayPhase(); // NT, E leads
    // Complete a trick
    e.playCard("E", "HA");
    e.playCard("S", "DA");
    e.playCard("W", "CA");
    e.playCard("N", "SA");
    expect(e.board.tricks.length).toBe(1);
    expect(e.board.tricks[0].winner).toBe("E");

    // Undo last card of the trick
    e.undo();
    expect(e.board.hands.N).toContain("SA");
    expect(e.board.tricks[0].winner).toBeUndefined();
    expect(e.board.tricks[0].cards.length).toBe(3);
  });

  it("undoes back from play to auction phase", () => {
    const e = new MatchEngine("test", 1, "N", "None", sampleHands());
    e.makeCall("N", "1NT");
    e.makeCall("E", "P");
    e.makeCall("S", "P");
    e.makeCall("W", "P");
    expect(e.board.phase).toBe("play");

    // Undo the last pass (which completed the auction)
    e.undo();
    expect(e.board.phase).toBe("auction");
    expect(e.board.contract).toBeUndefined();
    expect(e.board.currentTurn).toBe("W");
  });
});

describe("Set result manually", () => {
  it("sets result and marks board complete", () => {
    const e = setupPlayPhase();
    const r = e.setResult("N", "1NT", 7);
    expect(r.success).toBe(true);
    expect(e.board.phase).toBe("complete");
    expect(e.board.result).toBeDefined();
    expect(e.board.result!.tricksMade).toBe(7);
    // 1NT making exactly: 40 trick points + 50 partscore bonus = 90
    expect(e.board.result!.score).toBe(90);
  });
});
