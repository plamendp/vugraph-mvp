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
- **Framework**: Fastify (pure HTTP service)
- **ORM**: Drizzle ORM (TypeScript-native, SQL-like)
- **Database**: Postgres (local Docker container; AWS RDS in cloud)
- **WebSocket Broker**: Centrifugo v6 (local Docker container; AWS ECS in cloud)
- **Centrifugo State**: Redis (local Docker container; AWS ElastiCache in cloud)
- **Testing**: Vitest
- **Containerization**: Docker + Docker Compose

## Architecture

### Design Principle: Environment Parity

The application code is identical in local and cloud deployments. Only the outer routing layer differs (nginx vs ALB/CloudFront). Centrifugo + Redis run as the same Docker images in both environments.

### Local (Docker Compose — 7 containers)

```
Client (browser)
    |
  nginx (:80)
    |-- /api/*                    --> backend (:3000)
    |-- /connection/websocket     --> centrifugo (:8000)
    |-- /operator/*               --> operator-client (:5001)
    |-- /spectator/*              --> spectator-client (:5002)

  centrifugo (:8000)
        |
        ├── Redis (:6379)         — pub/sub, presence, history
        |
        └── proxy HTTP            — forwards client events to backend
            ├── connect proxy     --> POST backend:3000/centrifugo/connect
            ├── rpc proxy         --> POST backend:3000/centrifugo/rpc
            └── subscribe proxy   --> POST backend:3000/centrifugo/subscribe

  backend (:3000)
        |
        ├── publishes to centrifugo HTTP API (http://centrifugo:8000/api)
        |
        └── Postgres (:5432)
```

### Cloud (AWS)

```
ALB / CloudFront
    |-- /api/*                    --> backend (ECS)
    |-- /connection/websocket     --> centrifugo (ECS)
    |-- /operator, /spectator     --> S3 + CloudFront

  centrifugo (ECS)  --> ElastiCache Redis
       └── proxy HTTP --> backend (ECS)

  backend (ECS) --> RDS Postgres
       └── publishes to centrifugo HTTP API
```

### How Real-Time Works (Centrifugo Proxy Pattern)

1. Client connects to Centrifugo via WebSocket
2. Centrifugo calls **connect proxy** → backend authenticates, returns user ID + role
3. Client subscribes to channel `match:{id}` → Centrifugo calls **subscribe proxy** → backend authorizes
4. Operator sends bid/play via **RPC** → Centrifugo calls **RPC proxy** → backend validates with match engine
5. Backend publishes state updates to Centrifugo HTTP API → Centrifugo fans out to all subscribers

**The backend never holds WebSocket connections.** It only receives HTTP proxy calls from Centrifugo and publishes back via Centrifugo's HTTP API.

### Data Ownership
- **Redis** (Centrifugo's concern): pub/sub fanout, channel presence, message history. If Redis dies, clients reconnect.
- **Postgres** (our concern): matches, boards, scores — all persistent domain data.

## Commands

- `npm run stack` — build and start full local Docker stack
- `npm run dev` — start backend dev server only (tsx, needs Postgres/Centrifugo running)
- `npm test` — run tests (vitest)
- `npm run test:watch` — run tests in watch mode
- `npx tsc --noEmit` — type-check without emitting
- `docker compose down` — stop local stack

## Project Structure

```
src/
  server.ts              — Entry point (Fastify HTTP setup + Centrifugo proxy routes)
  config.ts              — All config from environment variables
  engine/                — Match engine (pure logic, no I/O)
    types.ts             — All types and constants
    card-utils.ts        — Card/bid parsing, seat helpers, vulnerability lookup
    auction.ts           — Auction validation and contract determination
    play.ts              — Play validation and trick winner logic
    scoring.ts           — Duplicate bridge scoring + IMP conversion
    match-engine.ts      — Central state machine (MatchEngine class)
  centrifugo/            — Centrifugo integration
    client.ts            — HTTP client for Centrifugo server API (publish, etc.)
    proxy-handler.ts     — Fastify routes for connect/subscribe/rpc proxy
  api/                   — REST API
    matches.ts           — Match CRUD routes
    boards.ts            — Board routes
  db/
    schema.ts            — Drizzle table definitions
    database.ts          — DB access layer (Drizzle + pg)
    types.ts             — IDatabase async interface
    mock-database.ts     — In-memory mock for tests
tests/
  engine/
    auction.test.ts      — Auction validation tests
    play.test.ts         — Play validation + trick flow tests
  ws/
    protocol.test.ts     — Message parsing tests
centrifugo/
  config.json            — Centrifugo configuration
example.env              — Env var template (cp to .env, fill secrets)
docker-compose.yml       — Local 5-service stack (nginx, backend, centrifugo, redis, postgres)
Dockerfile               — Backend multi-stage build
nginx/
  nginx.conf             — Reverse proxy config
```

## Environment Variables

Secrets and config are in `.env` (git-ignored). Copy `example.env` to `.env` and fill in values.
Docker Compose reads `.env` automatically and injects vars into containers.

Backend env vars (in `src/config.ts`):
- `PORT` — server port (default: 3000)
- `HOST` — bind address (default: 0.0.0.0)
- `LOCAL_DEV` — `true` when running via Docker Compose (hardcoded in docker-compose.yml)
- `DATABASE_URL` — Postgres connection string (required, constructed from POSTGRES_* vars in compose)
- `OPERATOR_TOKEN` — auth token for operator connections (required)
- `CENTRIFUGO_API_URL` — Centrifugo HTTP API endpoint (default: http://localhost:8000/api)
- `CENTRIFUGO_API_KEY` — API key for Centrifugo server API (required)
- `CENTRIFUGO_TOKEN_SECRET` — HMAC secret shared with Centrifugo for JWT signing (required)

See `example.env` for the full list including Postgres and Centrifugo admin vars.

## Current Status

**Implemented:**
- Match engine with full auction + play validation, undo support, scoring (src/engine/)
- REST API for match/board CRUD (src/api/ — async, uses IDatabase interface)
- Drizzle ORM for Postgres (src/db/schema.ts + database.ts)
- Centrifugo proxy integration (src/centrifugo/ — connect, subscribe, RPC handlers)
- WebSocket protocol and message type definitions (src/ws/protocol.ts)
- Docker infrastructure: 5 services (nginx, backend, centrifugo, redis, postgres)
- .env-based secrets management with example.env template
- 55 tests, all passing

**Not yet implemented:**
- Operator client UI (React SPA)
- Spectator client UI (React SPA)
- File import (.pbn, .dup, .lin)
- Commentary system
- AWS deployment

## Decisions Made

- **ORM**: Drizzle ORM (TypeScript-native, lightweight, SQL-like)
- **WebSocket broker**: Centrifugo v6 (proxy pattern — backend stays pure HTTP)
- **Redis**: Used by Centrifugo for pub/sub + presence + history; backend does NOT use Redis directly
- **Testing strategy**: IDatabase interface + in-memory mock for unit tests; engine/protocol tests unchanged

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

## Real-Time Protocol

### Client → Centrifugo → Backend (via RPC proxy)

Operator sends RPC calls through Centrifugo. The `method` field maps to actions:

- `load_board` — load a board with hands, dealer, vulnerability
- `call` — make a bid/pass/double/redouble
- `play` — play a card
- `undo` — undo last action
- `set_result` — manually set result (e.g., claim)

### Backend → Centrifugo → Clients (via publish API)

Backend publishes to channel `match:{matchId}`:

- `state` — full state sync
- `call_made` — bid was made
- `card_played` — card was played
- `trick_complete` — trick finished
- `board_complete` — board finished with result
- `undo_performed` — undo with new state
