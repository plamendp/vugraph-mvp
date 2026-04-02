import type { BoardState, Match, MatchStatus } from "../engine/types.js";
import type { RoleName, User } from "../auth/types.js";
import type { IDatabase } from "./types.js";

/**
 * In-memory mock database for unit tests.
 * No Postgres or Drizzle dependency — pure TypeScript.
 */
export class MockDB implements IDatabase {
  private matches = new Map<string, Match>();
  private boards = new Map<string, BoardState>(); // key: `${matchId}:${boardNumber}`
  private users = new Map<number, User>();
  private usersByName = new Map<string, User>();
  private userRolesMap = new Map<number, Set<RoleName>>();
  private rolesSeeded = new Set<RoleName>();
  private nextUserId = 1;

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

  // ── Users ──

  async getUserByUsername(username: string): Promise<User | null> {
    return this.usersByName.get(username) ?? null;
  }

  async getUserById(id: number): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async listUsers(): Promise<User[]> {
    return [...this.users.values()].sort((a, b) => a.id - b.id);
  }

  async createUser(username: string, passwordHash: string): Promise<User> {
    const user: User = {
      id: this.nextUserId++,
      username,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    this.usersByName.set(user.username, user);
    return user;
  }

  // ── Roles ──

  async getUserRoles(userId: number): Promise<RoleName[]> {
    const roleSet = this.userRolesMap.get(userId);
    return roleSet ? [...roleSet] : [];
  }

  async assignRole(userId: number, roleName: RoleName): Promise<void> {
    let roleSet = this.userRolesMap.get(userId);
    if (!roleSet) {
      roleSet = new Set();
      this.userRolesMap.set(userId, roleSet);
    }
    roleSet.add(roleName);
  }

  async ensureRolesExist(roleNames: RoleName[]): Promise<void> {
    for (const name of roleNames) {
      this.rolesSeeded.add(name);
    }
  }

  async close(): Promise<void> {
    this.matches.clear();
    this.boards.clear();
    this.users.clear();
    this.usersByName.clear();
    this.userRolesMap.clear();
  }
}
