import { pgTable, text, integer, serial, jsonb, timestamp, unique } from "drizzle-orm/pg-core";

export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  segment: text("segment").notNull().default(""),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const boards = pgTable(
  "boards",
  {
    id: serial("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    boardNumber: integer("board_number").notNull(),
    dealer: text("dealer").notNull(),
    vulnerability: text("vulnerability").notNull(),
    hands: jsonb("hands").notNull(),
    auction: jsonb("auction").notNull().default([]),
    play: jsonb("play").notNull().default([]),
    contract: jsonb("contract"),
    declarer: text("declarer"),
    result: jsonb("result"),
    phase: text("phase").notNull().default("setup"),
  },
  (table) => [unique().on(table.matchId, table.boardNumber)],
);
