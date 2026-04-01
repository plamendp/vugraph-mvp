# Bridge Vugraph MVP

Web-based vugraph system for broadcasting contract bridge matches in real time.

## Domain Overview

"Vugraph" is the bridge world's term for live broadcasting of tournament play to an audience.

### Roles
- **Operator**: Sits near players at a tournament table. Inputs bids and card plays as they happen. Needs a UI optimized for speed and accuracy.
- **Spectator**: Connects via browser to watch the match live. Sees all four hands, auction, trick play, score, and commentary.
- **Commentator** (stretch goal): Expert providing text commentary alongside live action.

### Bridge Basics
- 52-card deck, 4 suits: Spades, Hearts, Diamonds, Clubs
- 4 players at compass positions: North, East, South, West (N-S partners vs E-W)
- Each player receives 13 cards
- **Vulnerability**: Determined by board number, affects scoring
- **Dealer**: Rotates by board number (1=N, 2=E, 3=S, 4=W, repeats)

### Auction (Bidding)
- Starts with dealer, proceeds clockwise
- Bid = level (1-7) + denomination (C < D < H < S < NT); each must be higher than previous
- Special calls: Pass, Double (opponent's bid), Redouble (opponent's double)
- Ends after 3 consecutive passes (following a bid), or 4 passes (passed out)
- Final bid = contract; declarer = first player of winning side to name that denomination

### Play
- 13 tricks; opening lead by player to declarer's left
- After opening lead, dummy's hand is revealed
- Must follow suit if able; otherwise any card
- Highest card of led suit wins, unless trumped (contract's suit)
- No Trump = no trump suit; trick winner leads next

### Scoring
- Duplicate bridge scoring: trick score, overtricks/undertricks, game/slam bonuses
- Team matches use IMPs (International Match Points)
- Match = multiple boards grouped into segments

## Tech Stack

- **Runtime**: Node.js + TypeScript (ESM)
- **Framework**: Fastify (pure HTTP service, no WebSocket library)
- **Database**: Postgres (local Docker container; AWS RDS in cloud)
- **Cache/Connection State**: Redis (local Docker container; AWS ElastiCache in cloud)
- **Testing**: Vitest
- **Containerization**: Docker + Docker Compose

## Architecture

### Design Principle: Environment Parity

The application code is identical in local and cloud deployments. Only the infrastructure wrapper changes. A single env var `LOCAL_DEV` signals local development when needed.

### Local (Docker Compose — 7 containers)

```
Client (browser)
    |
  nginx (:80)
    |-- /api/*          --> backend (:3000)
    |-- /ws             --> ws-gateway-sim (:4000)
    |-- /operator/*     --> operator-client (:5001)
    |-- /spectator/*    --> spectator-client (:5002)

  ws-gateway-sim (:4000)
        |
        v  HTTP POST
    backend (:3000)
        |
   +----+----+
 Redis    Postgres
```

### Cloud (AWS)

```
API Gateway HTTP    --> backend (ECS) --> ElastiCache Redis, RDS Postgres
API Gateway WS      --> backend (ECS)
CloudFront + S3     --> operator-client, spectator-client
```

### WebSocket Architecture

The backend **never** uses `ws` or any WebSocket library. WebSocket connections are managed externally:

- **Locally**: `ws-gateway-sim` container accepts WebSocket connections and forwards to backend as HTTP
- **Cloud**: AWS API Gateway WebSocket API does the same

Backend HTTP routes for WebSocket operations:
- `POST /ws/connect` — called on client connect (with connectionId)
- `POST /ws/disconnect` — called on client disconnect
- `POST /ws/message` — called when client sends a message
- Backend pushes messages by POSTing to the gateway's callback URL (`/@connections/{connectionId}`)

### Data Ownership
- **Redis** (ephemeral): WebSocket connection IDs, room memberships, active session state. If Redis dies, clients reconnect. No persistent data in Redis.
- **Postgres** (persistent): Users, roles, permissions, matches, boards, scores. All persistent domain data.

## Commands

- `npm run dev` — start dev server (tsx)
- `npm test` — run tests (vitest)
- `npm run test:watch` — run tests in watch mode
- `npx tsc --noEmit` — type-check without emitting

## Project Structure

```
src/
  server.ts              — Entry point (Fastify HTTP setup)
  config.ts              — All config from environment variables
  engine/                — Match engine (pure logic, no I/O)
    types.ts             — All types and constants
    card-utils.ts        — Card/bid parsing, seat helpers, vulnerability lookup
    auction.ts           — Auction validation and contract determination
    play.ts              — Play validation and trick winner logic
    scoring.ts           — Duplicate bridge scoring + IMP conversion
    match-engine.ts      — Central state machine (MatchEngine class)
  ws/                    — WebSocket HTTP handlers (no ws library)
    protocol.ts          — Message types + parseInboundMessage
    rooms.ts             — RoomManager (backed by Redis)
    handler.ts           — Message router (auth, call, play, undo, etc.)
  api/                   — REST API
    matches.ts           — Match CRUD routes
    boards.ts            — Board routes
  db/
    schema.sql           — Postgres schema
    database.ts          — DB access layer (Postgres)
tests/
  engine/
    auction.test.ts      — Auction validation tests
    play.test.ts         — Play validation + trick flow tests
  ws/
    protocol.test.ts     — Message parsing tests
```

## Environment Variables

All configuration is via env vars (defaults in `src/config.ts`):

- `LOCAL_DEV` — set to `true` for local Docker development
- `PORT` — server port (default: 3000)
- `HOST` — bind address (default: 0.0.0.0)
- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string
- `OPERATOR_TOKEN` — auth token for operator connections
- `WS_GATEWAY_CALLBACK_URL` — URL for pushing messages to clients via gateway

## Current Status

**Implemented (Phase 1 backend — needs migration):**
- Match engine with full auction + play validation, undo support, scoring
- REST API for match/board CRUD
- 55 tests, all passing
- Currently uses SQLite + in-memory ws — to be migrated to Postgres + Redis + HTTP-based ws

**Next: Dockerization**
- Docker Compose with 7 containers (nginx, backend, ws-gateway-sim, redis, postgres, operator-client, spectator-client)
- Migrate SQLite to Postgres
- Migrate in-memory RoomManager to Redis
- Replace ws-based WebSocket handler with HTTP route handlers
- Build ws-gateway-sim container
- Build operator-client and spectator-client React containers

**Not yet implemented:**
- Operator client (React SPA)
- Spectator client (React SPA)
- File import (.pbn, .dup, .lin)
- Commentary system
- AWS CDK deployment

## Key Conventions

- Card notation: 2-char `<Suit><Rank>` — e.g., `SA` = Ace of Spades, `HT` = Ten of Hearts
- Bid notation: `P` (pass), `X` (double), `XX` (redouble), `1C`–`7NT`
- Seats: `N`, `E`, `S`, `W` (clockwise)
- Vulnerability: `None`, `NS`, `EW`, `All`

### Vulnerability by Board Number (16-board rotation)

```
Board:  1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16
Vul:   None  NS   EW  All   NS   EW  All  None  EW  All  None  NS  All  None  NS   EW
Dealer:  N    E    S    W    N    E    S    W    N    E    S    W    N    E    S    W
```

For board numbers > 16: `(boardNumber - 1) % 16 + 1`.

## WebSocket Protocol (Message Types)

### Client -> Server (via gateway)
- `auth` — authenticate with token and role
- `load_board` — load a board with hands, dealer, vulnerability
- `call` — make a bid/pass/double/redouble
- `play` — play a card
- `undo` — undo last action
- `set_result` — manually set result (e.g., claim)

### Server -> Client (via gateway callback)
- `state` — full state sync
- `call_made` — bid was made
- `card_played` — card was played
- `trick_complete` — trick finished
- `board_complete` — board finished with result
- `undo_performed` — undo with new state

## File Format Support (Stretch Goal)
- `.pbn` (Portable Bridge Notation) — industry standard
- `.dup` (Duplimate) — dealing machine format
- `.lin` (BBO) — Bridge Base Online format
