import type { BoardState, Match, MatchStatus } from "../engine/types.js";
import type { IDatabase } from "./types.js";

/**
 * In-memory mock database for unit tests.
 * No Postgres or Drizzle dependency — pure TypeScript.
 */
export class MockDB implements IDatabase {
  private matches = new Map<string, Match>();
  private boards = new Map<string, BoardState>(); // key: `${matchId}:${boardNumber}`

  async init(): Promise<void> {
    // No-op
  }

  async createMatch(match: Omit<Match, "createdAt">): Promise<Match> {
    const full: Match = { ...match, createdAt: new Date().toISOString() };
    this.matches.set(match.id, full);
    return full;
  }

  async getMatch(id: string): Promise<Match | null> {
    return this.matches.get(id) ?? null;
  }

  async listMatches(): Promise<Match[]> {
    return [...this.matches.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async updateMatchStatus(id: string, status: MatchStatus): Promise<void> {
    const match = this.matches.get(id);
    if (match) match.status = status;
  }

  async deleteMatch(id: string): Promise<void> {
    this.matches.delete(id);
    // Cascade: delete boards for this match
    for (const [key, board] of this.boards) {
      if (board.matchId === id) this.boards.delete(key);
    }
  }

  async saveBoard(board: BoardState): Promise<void> {
    const key = `${board.matchId}:${board.boardNumber}`;
    this.boards.set(key, structuredClone(board));
  }

  async getBoard(matchId: string, boardNumber: number): Promise<BoardState | null> {
    return this.boards.get(`${matchId}:${boardNumber}`) ?? null;
  }

  async listBoards(matchId: string): Promise<BoardState[]> {
    return [...this.boards.values()]
      .filter((b) => b.matchId === matchId)
      .sort((a, b) => a.boardNumber - b.boardNumber);
  }

  async close(): Promise<void> {
    this.matches.clear();
    this.boards.clear();
  }
}
