import { pgTable, text, integer, serial, jsonb, timestamp, unique, primaryKey } from "drizzle-orm/pg-core";

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

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);
