import pg from "pg";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoardState, Match, MatchStatus } from "../engine/types.js";
import type { IDatabase } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class DB implements IDatabase {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async init(): Promise<void> {
    const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
    await this.pool.query(schema);
  }

  // ── Matches ──

  async createMatch(match: Omit<Match, "createdAt">): Promise<Match> {
    await this.pool.query(
      `INSERT INTO matches (id, title, segment, home_team, away_team, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [match.id, match.title, match.segment, match.homeTeam, match.awayTeam, match.status],
    );
    return (await this.getMatch(match.id))!;
  }

  async getMatch(id: string): Promise<Match | null> {
    const { rows } = await this.pool.query("SELECT * FROM matches WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return rowToMatch(rows[0]);
  }

  async listMatches(): Promise<Match[]> {
    const { rows } = await this.pool.query("SELECT * FROM matches ORDER BY created_at DESC");
    return rows.map(rowToMatch);
  }

  async updateMatchStatus(id: string, status: MatchStatus): Promise<void> {
    await this.pool.query("UPDATE matches SET status = $1 WHERE id = $2", [status, id]);
  }

  async deleteMatch(id: string): Promise<void> {
    await this.pool.query("DELETE FROM matches WHERE id = $1", [id]);
  }

  // ── Boards ──

  async saveBoard(board: BoardState): Promise<void> {
    await this.pool.query(
      `INSERT INTO boards (match_id, board_number, dealer, vulnerability, hands, auction, play, contract, declarer, result, phase)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT(match_id, board_number) DO UPDATE SET
         hands = EXCLUDED.hands,
         auction = EXCLUDED.auction,
         play = EXCLUDED.play,
         contract = EXCLUDED.contract,
         declarer = EXCLUDED.declarer,
         result = EXCLUDED.result,
         phase = EXCLUDED.phase`,
      [
        board.matchId,
        board.boardNumber,
        board.dealer,
        board.vulnerability,
        JSON.stringify(board.hands),
        JSON.stringify(board.auction),
        JSON.stringify(board.play),
        board.contract ? JSON.stringify(board.contract) : null,
        board.declarer ?? null,
        board.result ? JSON.stringify(board.result) : null,
        board.phase,
      ],
    );
  }

  async getBoard(matchId: string, boardNumber: number): Promise<BoardState | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM boards WHERE match_id = $1 AND board_number = $2",
      [matchId, boardNumber],
    );
    if (rows.length === 0) return null;
    return rowToBoard(rows[0]);
  }

  async listBoards(matchId: string): Promise<BoardState[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM boards WHERE match_id = $1 ORDER BY board_number",
      [matchId],
    );
    return rows.map(rowToBoard);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function rowToMatch(row: any): Match {
  return {
    id: row.id,
    title: row.title,
    segment: row.segment,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function rowToBoard(row: any): BoardState {
  // pg auto-parses JSONB columns, but guard in case of TEXT fallback
  const parse = (val: any) => (typeof val === "string" ? JSON.parse(val) : val);
  return {
    matchId: row.match_id,
    boardNumber: row.board_number,
    dealer: row.dealer,
    vulnerability: row.vulnerability,
    hands: parse(row.hands),
    phase: row.phase,
    auction: parse(row.auction),
    play: parse(row.play),
    tricks: [],
    contract: row.contract ? parse(row.contract) : undefined,
    declarer: row.declarer ?? undefined,
    result: row.result ? parse(row.result) : undefined,
  };
}
