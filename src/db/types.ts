import type { BoardState, Match, MatchStatus } from "../engine/types.js";

export interface IDatabase {
  init(): Promise<void>;
  createMatch(match: Omit<Match, "createdAt">): Promise<Match>;
  getMatch(id: string): Promise<Match | null>;
  listMatches(): Promise<Match[]>;
  updateMatchStatus(id: string, status: MatchStatus): Promise<void>;
  deleteMatch(id: string): Promise<void>;
  saveBoard(board: BoardState): Promise<void>;
  getBoard(matchId: string, boardNumber: number): Promise<BoardState | null>;
  listBoards(matchId: string): Promise<BoardState[]>;
  close(): Promise<void>;
}
