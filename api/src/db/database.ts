import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc } from "drizzle-orm";
import pg from "pg";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoardState, Match, MatchStatus } from "../engine/types.js";
import type { IDatabase } from "./types.js";
import { matches, boards } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class DB implements IDatabase {
  private pool: pg.Pool;
  private db: ReturnType<typeof drizzle>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
    this.db = drizzle(this.pool);
  }

  async init(): Promise<void> {
    // Run raw schema SQL for table creation (idempotent with IF NOT EXISTS)
    const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
    await this.pool.query(schema);
  }

  // ── Matches ──

  async createMatch(match: Omit<Match, "createdAt">): Promise<Match> {
    const [row] = await this.db
      .insert(matches)
      .values({
        id: match.id,
        title: match.title,
        segment: match.segment,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        status: match.status,
      })
      .returning();
    return rowToMatch(row);
  }

  async getMatch(id: string): Promise<Match | null> {
    const rows = await this.db.select().from(matches).where(eq(matches.id, id));
    if (rows.length === 0) return null;
    return rowToMatch(rows[0]);
  }

  async listMatches(): Promise<Match[]> {
    const rows = await this.db.select().from(matches).orderBy(desc(matches.createdAt));
    return rows.map(rowToMatch);
  }

  async updateMatchStatus(id: string, status: MatchStatus): Promise<void> {
    await this.db.update(matches).set({ status }).where(eq(matches.id, id));
  }

  async deleteMatch(id: string): Promise<void> {
    await this.db.delete(matches).where(eq(matches.id, id));
  }

  // ── Boards ──

  async saveBoard(board: BoardState): Promise<void> {
    // Upsert: insert or update on conflict
    await this.db
      .insert(boards)
      .values({
        matchId: board.matchId,
        boardNumber: board.boardNumber,
        dealer: board.dealer,
        vulnerability: board.vulnerability,
        hands: board.hands,
        auction: board.auction,
        play: board.play,
        contract: board.contract ?? null,
        declarer: board.declarer ?? null,
        result: board.result ?? null,
        phase: board.phase,
      })
      .onConflictDoUpdate({
        target: [boards.matchId, boards.boardNumber],
        set: {
          hands: board.hands,
          auction: board.auction,
          play: board.play,
          contract: board.contract ?? null,
          declarer: board.declarer ?? null,
          result: board.result ?? null,
          phase: board.phase,
        },
      });
  }

  async getBoard(matchId: string, boardNumber: number): Promise<BoardState | null> {
    const rows = await this.db
      .select()
      .from(boards)
      .where(and(eq(boards.matchId, matchId), eq(boards.boardNumber, boardNumber)));
    if (rows.length === 0) return null;
    return rowToBoard(rows[0]);
  }

  async listBoards(matchId: string): Promise<BoardState[]> {
    const rows = await this.db
      .select()
      .from(boards)
      .where(eq(boards.matchId, matchId))
      .orderBy(boards.boardNumber);
    return rows.map(rowToBoard);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function rowToMatch(row: typeof matches.$inferSelect): Match {
  return {
    id: row.id,
    title: row.title,
    segment: row.segment,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    status: row.status as Match["status"],
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

function rowToBoard(row: typeof boards.$inferSelect): BoardState {
  return {
    matchId: row.matchId,
    boardNumber: row.boardNumber,
    dealer: row.dealer as any,
    vulnerability: row.vulnerability as any,
    hands: row.hands as any,
    phase: row.phase as any,
    auction: row.auction as any,
    play: row.play as any,
    tricks: [],
    contract: (row.contract as any) ?? undefined,
    declarer: (row.declarer as any) ?? undefined,
    result: (row.result as any) ?? undefined,
  };
}
