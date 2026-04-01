import type { BoardState, Match, MatchStatus } from "../engine/types.js";
import type { RoleName, User } from "../auth/types.js";

export interface IDatabase {
  init(): Promise<void>;

  // Matches
  createMatch(match: Omit<Match, "createdAt">): Promise<Match>;
  getMatch(id: string): Promise<Match | null>;
  listMatches(): Promise<Match[]>;
  updateMatchStatus(id: string, status: MatchStatus): Promise<void>;
  deleteMatch(id: string): Promise<void>;

  // Boards
  saveBoard(board: BoardState): Promise<void>;
  getBoard(matchId: string, boardNumber: number): Promise<BoardState | null>;
  listBoards(matchId: string): Promise<BoardState[]>;

  // Users
  getUserByUsername(username: string): Promise<User | null>;
  getUserById(id: number): Promise<User | null>;
  createUser(username: string, passwordHash: string): Promise<User>;

  // Roles
  getUserRoles(userId: number): Promise<RoleName[]>;
  assignRole(userId: number, roleName: RoleName): Promise<void>;
  ensureRolesExist(roleNames: RoleName[]): Promise<void>;

  close(): Promise<void>;
}
