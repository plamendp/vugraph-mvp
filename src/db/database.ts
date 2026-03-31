import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoardState, Match, MatchStatus } from "../engine/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class DB {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
    this.db.exec(schema);
  }

  // ── Matches ──

  createMatch(match: Omit<Match, "createdAt">): Match {
    const stmt = this.db.prepare(
      `INSERT INTO matches (id, title, segment, home_team, away_team, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(match.id, match.title, match.segment, match.homeTeam, match.awayTeam, match.status);
    return this.getMatch(match.id)!;
  }

  getMatch(id: string): Match | null {
    const row = this.db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as any;
    if (!row) return null;
    return rowToMatch(row);
  }

  listMatches(): Match[] {
    const rows = this.db.prepare("SELECT * FROM matches ORDER BY created_at DESC").all() as any[];
    return rows.map(rowToMatch);
  }

  updateMatchStatus(id: string, status: MatchStatus): void {
    this.db.prepare("UPDATE matches SET status = ? WHERE id = ?").run(status, id);
  }

  deleteMatch(id: string): void {
    this.db.prepare("DELETE FROM matches WHERE id = ?").run(id);
  }

  // ── Boards ──

  saveBoard(board: BoardState): void {
    const stmt = this.db.prepare(
      `INSERT INTO boards (match_id, board_number, dealer, vulnerability, hands, auction, play, contract, declarer, result, phase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(match_id, board_number) DO UPDATE SET
         hands = excluded.hands,
         auction = excluded.auction,
         play = excluded.play,
         contract = excluded.contract,
         declarer = excluded.declarer,
         result = excluded.result,
         phase = excluded.phase`,
    );
    stmt.run(
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
    );
  }

  getBoard(matchId: string, boardNumber: number): BoardState | null {
    const row = this.db
      .prepare("SELECT * FROM boards WHERE match_id = ? AND board_number = ?")
      .get(matchId, boardNumber) as any;
    if (!row) return null;
    return rowToBoard(row);
  }

  listBoards(matchId: string): BoardState[] {
    const rows = this.db
      .prepare("SELECT * FROM boards WHERE match_id = ? ORDER BY board_number")
      .all(matchId) as any[];
    return rows.map(rowToBoard);
  }

  close(): void {
    this.db.close();
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
    createdAt: row.created_at,
  };
}

function rowToBoard(row: any): BoardState {
  return {
    matchId: row.match_id,
    boardNumber: row.board_number,
    dealer: row.dealer,
    vulnerability: row.vulnerability,
    hands: JSON.parse(row.hands),
    phase: row.phase,
    auction: JSON.parse(row.auction),
    play: JSON.parse(row.play),
    tricks: [], // tricks are rebuilt from play entries if needed
    contract: row.contract ? JSON.parse(row.contract) : undefined,
    declarer: row.declarer ?? undefined,
    result: row.result ? JSON.parse(row.result) : undefined,
  };
}
