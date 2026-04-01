import type { Contract, Vulnerability } from "./types.js";

/**
 * Calculate duplicate bridge score for a completed board.
 * Positive = declarer's score, negative = defenders' score.
 */
export function calculateScore(
  contract: Contract,
  vulnerability: Vulnerability,
  tricksMade: number,
): number {
  const vul = isVulnerable(contract.declarer, vulnerability);
  const tricksNeeded = 6 + contract.level;
  const result = tricksMade - tricksNeeded;

  if (result >= 0) {
    return makingScore(contract, vul, result);
  } else {
    return -undertrickPenalty(contract, vul, -result);
  }
}

function isVulnerable(declarer: "N" | "E" | "S" | "W", vul: Vulnerability): boolean {
  if (vul === "All") return true;
  if (vul === "None") return false;
  if (vul === "NS") return declarer === "N" || declarer === "S";
  return declarer === "E" || declarer === "W";
}

function makingScore(contract: Contract, vul: boolean, overtricks: number): number {
  const { level, denomination, doubled, redoubled } = contract;
  const multiplier = redoubled ? 4 : doubled ? 2 : 1;

  // Trick score
  let trickPoints: number;
  if (denomination === "C" || denomination === "D") {
    trickPoints = 20 * level * multiplier;
  } else if (denomination === "H" || denomination === "S") {
    trickPoints = 30 * level * multiplier;
  } else {
    // NT: 40 for first trick + 30 for rest
    trickPoints = (40 + 30 * (level - 1)) * multiplier;
  }

  let score = trickPoints;

  // Game / partscore bonus
  if (trickPoints >= 100) {
    score += vul ? 500 : 300; // game bonus
  } else {
    score += 50; // partscore bonus
  }

  // Slam bonus
  if (level === 6) score += vul ? 750 : 500;
  if (level === 7) score += vul ? 1500 : 1000;

  // Overtrick bonus
  if (overtricks > 0) {
    if (redoubled) {
      score += overtricks * (vul ? 400 : 200);
    } else if (doubled) {
      score += overtricks * (vul ? 200 : 100);
    } else {
      if (denomination === "C" || denomination === "D") {
        score += overtricks * 20;
      } else {
        score += overtricks * 30;
      }
    }
  }

  // Insult bonus for making doubled/redoubled
  if (doubled) score += 50;
  if (redoubled) score += 100;

  return score;
}

function undertrickPenalty(contract: Contract, vul: boolean, down: number): number {
  const { doubled, redoubled } = contract;

  if (!doubled && !redoubled) {
    return down * (vul ? 100 : 50);
  }

  const dblMultiplier = redoubled ? 2 : 1;
  let penalty = 0;

  if (vul) {
    // Vulnerable doubled: 200, 300, 300, 300, ...
    penalty += 200; // first undertrick
    if (down > 1) penalty += (down - 1) * 300;
  } else {
    // Not vulnerable doubled: 100, 200, 200, 300, 300, ...
    penalty += 100; // first
    if (down >= 2) penalty += 200; // second
    if (down >= 3) penalty += 200; // third
    if (down > 3) penalty += (down - 3) * 300; // fourth onwards
  }

  return penalty * dblMultiplier;
}

// ── IMP Conversion ──

const IMP_TABLE = [
  20, 50, 90, 130, 170, 220, 270, 320, 370, 430,
  500, 600, 750, 900, 1100, 1300, 1500, 1750, 2000, 2250,
  2500, 3000, 3500, 4000,
];

/**
 * Convert a point difference to IMPs using the standard table.
 */
export function calculateIMPs(diff: number): number {
  const absDiff = Math.abs(diff);
  for (let i = 0; i < IMP_TABLE.length; i++) {
    if (absDiff < IMP_TABLE[i]) return i * Math.sign(diff);
  }
  return 24 * Math.sign(diff);
}
