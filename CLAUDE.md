# Bridge Vugraph MVP

Web-based vugraph system for broadcasting contract bridge matches in real time. See `BRIDGE_VUGRAPH_SPEC.md` for the full domain spec.

## Tech Stack

- **Runtime**: Node.js + TypeScript (ESM)
- **Framework**: Fastify
- **Real-time**: WebSocket via `ws`
- **Database**: SQLite via `better-sqlite3`
- **Testing**: Vitest

## Commands

- `npm run dev` — start dev server (tsx)
- `npm test` — run tests (vitest)
- `npm run test:watch` — run tests in watch mode
- `npx tsc --noEmit` — type-check without emitting

## Project Structure

```
src/
  server.ts              — Entry point (Fastify + WebSocket setup)
  config.ts              — All config from environment variables
  engine/                — Match engine (pure logic, no I/O)
    types.ts             — All types and constants
    card-utils.ts        — Card/bid parsing, seat helpers, vulnerability lookup
    auction.ts           — Auction validation and contract determination
    play.ts              — Play validation and trick winner logic
    scoring.ts           — Duplicate bridge scoring + IMP conversion
    match-engine.ts      — Central state machine (MatchEngine class)
  ws/                    — WebSocket layer
    protocol.ts          — Message types + parseInboundMessage
    rooms.ts             — RoomManager (match rooms with operator + spectators)
    handler.ts           — Message router (auth, call, play, undo, etc.)
  api/                   — REST API
    matches.ts           — Match CRUD routes
    boards.ts            — Board routes
  db/
    schema.sql           — SQLite schema
    database.ts          — DB access layer
tests/
  engine/
    auction.test.ts      — Auction validation tests (28 tests)
    play.test.ts         — Play validation + trick flow tests (15 tests)
  ws/
    protocol.test.ts     — Message parsing tests (12 tests)
```

## Environment Variables

All configuration is via env vars (defaults in `src/config.ts`):

- `PORT` — server port (default: 3000)
- `HOST` — bind address (default: 0.0.0.0)
- `DB_PATH` — SQLite database path (default: ./data/vugraph.db)
- `OPERATOR_TOKEN` — auth token for operator WebSocket connections (default: operator-secret)

## Current Status

**Implemented (Phase 1 backend):**
- Match engine with full auction + play validation, undo support, scoring
- WebSocket server with operator auth, bidding, card play, undo, state broadcast
- REST API for match/board CRUD
- SQLite persistence
- 55 tests, all passing

**Not yet implemented:**
- Operator client (React SPA)
- Spectator client
- File import (.pbn, .dup, .lin)
- Commentary system

## Key Conventions

- Card notation: 2-char `<Suit><Rank>` — e.g., `SA` = Ace of Spades, `HT` = Ten of Hearts
- Bid notation: `P` (pass), `X` (double), `XX` (redouble), `1C`–`7NT`
- Seats: `N`, `E`, `S`, `W` (clockwise)
- Vulnerability: `None`, `NS`, `EW`, `All`
