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

### Local (Docker Compose — 6 containers)

```
Client (browser)
    |
  nginx (:80)
    |-- /operator/*               --> operator (:5001)
    |-- /api/*                    --> backend (:3000)
    |-- /connection/websocket     --> centrifugo (:8000)

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

1. Client connects to Centrifugo via WebSocket, passing JWT in `data.token`
2. Centrifugo calls **connect proxy** → backend verifies JWT, returns user ID + roles
3. Client subscribes to channel `match:{id}` → Centrifugo calls **subscribe proxy** → backend authorizes
4. Operator sends bid/play via **RPC** → Centrifugo calls **RPC proxy** → backend checks user has operator/admin role, validates with match engine
5. Backend publishes state updates to Centrifugo HTTP API → Centrifugo fans out to all subscribers

**The backend never holds WebSocket connections.** It only receives HTTP proxy calls from Centrifugo and publishes back via Centrifugo's HTTP API.

### Data Ownership
- **Redis** (Centrifugo's concern): pub/sub fanout, channel presence, message history. If Redis dies, clients reconnect.
- **Postgres** (our concern): matches, boards, users, roles, scores — all persistent domain data.

## Commands

From project root:
- `npm run stack` — build and start full local Docker stack
- `npm run stack:down` — stop local stack
- `npm run db:seed` — seed admin user (sources .env, connects to Postgres on localhost:5432)

From `api/`:
- `npm run dev` — start backend dev server only (tsx, needs Postgres/Centrifugo running)
- `npm test` — run tests (vitest)
- `npm run test:watch` — run tests in watch mode
- `npm run db:seed` — seed admin user (needs DATABASE_URL env var)
- `npx tsc --noEmit` — type-check without emitting

**Seeding workflow**: start the stack first (`npm run stack`), then in another terminal run `npm run db:seed` from the project root. Optionally set `SEED_ADMIN_PASSWORD=<password>` (defaults to "admin").

## Project Structure

```
api/                       — Backend service
  src/
    server.ts              — Entry point (Fastify setup, auth hook, all routes)
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
    auth/                  — Authentication & authorization
      types.ts             — RoleName, User, JwtPayload types
      password.ts          — bcrypt hash/verify (10 salt rounds)
      jwt.ts               — JWT sign/verify (HMAC with CENTRIFUGO_TOKEN_SECRET, 24h expiry)
      middleware.ts         — Global JWT hook + requireRole preHandler
    api/                   — REST API
      auth.ts              — Login, register (admin-only), me routes
      matches.ts           — Match CRUD routes (write ops: admin/operator only)
      boards.ts            — Board routes (write ops: admin/operator only)
    db/
      schema.ts            — Drizzle table definitions (matches, boards, users, roles, user_roles)
      schema.sql           — Raw SQL for idempotent table creation
      database.ts          — DB access layer (Drizzle + pg)
      types.ts             — IDatabase async interface
      mock-database.ts     — In-memory mock for tests
      seed.ts              — Seeds admin user (npm run db:seed)
    ws/
      protocol.ts          — Message type definitions + parsing
  tests/
    engine/
      auction.test.ts      — Auction validation tests (28)
      play.test.ts         — Play validation + trick flow tests (15)
    auth/
      auth.test.ts         — Password, JWT, auth flow tests (13)
    ws/
      protocol.test.ts     — Message parsing tests (12)
  Dockerfile               — Backend multi-stage build
  package.json             — Backend dependencies and scripts
  tsconfig.json
  vitest.config.ts         — Test config (includes env vars for tests)
  drizzle.config.ts
centrifugo/
  config.json              — Centrifugo configuration
nginx/
  nginx.conf               — Reverse proxy config
example.env                — Env var template (cp to .env, fill secrets)
apps/
  operator/                — Operator + Admin frontend (React + Vite)
    src/
      main.tsx             — Entry point (React root, BrowserRouter, AuthProvider)
      App.tsx              — Routes: /login, /users (protected)
      api.ts               — Fetch wrapper (Bearer token, 401 handling)
      styles.css           — MVP styling
      auth/
        AuthContext.tsx     — Auth state (user, token, login, logout)
        ProtectedRoute.tsx — Redirect if not authenticated / wrong role
      pages/
        LoginPage.tsx      — Login form
        UsersPage.tsx      — User list table + create user form
    Dockerfile             — Vite dev server container
    package.json
    vite.config.ts         — base: /operator/, port 5001
    tsconfig.json
docker-compose.yml         — Local 6-service stack
package.json               — Root scripts (stack, stack:down, db:seed)
```

## Environment Variables

Secrets and config are in `.env` (git-ignored). Copy `example.env` to `.env` and fill in values.
Docker Compose reads `.env` automatically and injects vars into containers.

Backend env vars (in `src/config.ts`):
- `PORT` — server port (default: 3000)
- `HOST` — bind address (default: 0.0.0.0)
- `LOCAL_DEV` — `true` when running via Docker Compose (hardcoded in docker-compose.yml, NOT in .env)
- `DATABASE_URL` — Postgres connection string (required, constructed from POSTGRES_* vars in compose)
- `CENTRIFUGO_API_URL` — Centrifugo HTTP API endpoint (default: http://localhost:8000/api)
- `CENTRIFUGO_API_KEY` — API key for Centrifugo server API (required)
- `CENTRIFUGO_TOKEN_SECRET` — HMAC secret shared with Centrifugo for JWT signing (required)

.env vars (not backend config, used by Docker Compose):
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — Postgres credentials
- `CENTRIFUGO_ADMIN_PASSWORD`, `CENTRIFUGO_ADMIN_SECRET` — Centrifugo admin UI

See `example.env` for the full template.

## Authentication & Authorization

### Auth Flow
1. Admin seeds initial user: `npm run db:seed` (creates "admin" user)
2. Admin registers more users: `POST /api/auth/register` (admin-only)
3. User logs in: `POST /api/auth/login` → receives JWT
4. JWT passed as `Authorization: Bearer <token>` for REST API
5. JWT passed in `data.token` for Centrifugo WebSocket connection

### Routes
- `POST /api/auth/login` — public, returns JWT + user info
- `POST /api/auth/register` — admin-only, creates user with specified roles
- `GET /api/auth/users` — admin-only, returns all users with roles
- `GET /api/auth/me` — any authenticated user, returns own info

### Public Paths (no auth required)
- `POST /api/auth/login`
- `GET /api/health`
- `/centrifugo/*` (Centrifugo proxy paths — they verify JWT themselves)

### Role Guards
- **Read operations** (GET matches, boards): any authenticated user
- **Write operations** (POST/PATCH/DELETE matches, POST boards): admin or operator
- **Register users**: admin only
- **Centrifugo RPC** (load_board, call, play, undo, set_result): admin or operator (checked via DB role lookup)

### Implementation Details
- Global `onRequest` hook (`registerAuthHook`) verifies JWT on every request except public paths
- `requireRole(...roles)` returns a Fastify `preHandler` that checks `req.user.roles`
- `req.user` is decorated on FastifyRequest via TypeScript declaration merge
- Centrifugo connect proxy verifies JWT from `data.token`, returns user ID as string
- Centrifugo RPC proxy looks up user roles from DB by parsed user ID
- Four roles seeded at DB init: admin, operator, spectator, commentator
- `jsonwebtoken` type collision: `verifyToken` uses `as unknown as JwtPayload` cast because jsonwebtoken exports its own `JwtPayload` type

## Current Status

**Implemented:**
- Match engine with full auction + play validation, undo support, scoring (src/engine/)
- REST API for match/board CRUD (src/api/ — async, uses IDatabase interface)
- User authentication with JWT + bcrypt (src/auth/)
- Role-based access control: admin, operator, spectator, commentator
- Auth routes: login, register (admin-only), list users (admin-only), me
- Role guards on write operations (matches, boards, Centrifugo RPC)
- Centrifugo connect proxy uses JWT verification
- Drizzle ORM for Postgres (src/db/schema.ts + database.ts)
- Centrifugo proxy integration (src/centrifugo/ — connect, subscribe, RPC handlers)
- WebSocket protocol and message type definitions (src/ws/protocol.ts)
- Admin frontend (apps/operator/) — login page, user management (list + create with roles)
- Docker infrastructure: 6 services (nginx, backend, centrifugo, redis, postgres, operator)
- .env-based secrets management with example.env template
- Admin seed script (npm run db:seed — runs from host against containerized Postgres)
- 69 tests, all passing

**Not yet implemented:**
- Operator board input UI (lives in apps/operator/, admin shell is done)
- Spectator client UI (apps/spectator/)
- File import (.pbn, .dup, .lin)
- AWS deployment

## Decisions Made

- **ORM**: Drizzle ORM (TypeScript-native, lightweight, SQL-like)
- **WebSocket broker**: Centrifugo v6 (proxy pattern — backend stays pure HTTP)
- **Redis**: Used by Centrifugo for pub/sub + presence + history; backend does NOT use Redis directly
- **Auth**: JWT using CENTRIFUGO_TOKEN_SECRET as shared HMAC secret (single secret for both REST auth and Centrifugo client auth); bcrypt for password hashing; 24h token expiry; no refresh tokens (MVP)
- **Host-to-container tooling**: npm scripts in root package.json source .env and connect to localhost-exposed ports (e.g., db:seed connects to Postgres on localhost:5432)
- **Testing strategy**: IDatabase interface + in-memory mock for unit tests; vitest.config.ts sets required env vars (DATABASE_URL, CENTRIFUGO_TOKEN_SECRET, CENTRIFUGO_API_KEY) so config.ts doesn't throw during test imports
- **LOCAL_DEV**: Hardcoded `LOCAL_DEV=true` in docker-compose.yml, NOT in .env (it's always true under Docker Compose)
- **No default secrets**: All sensitive config uses `requireEnv()` which throws if the env var is missing — no fallback defaults for secrets
- **Frontend**: React + Vite + TypeScript, plain CSS (MVP). No monorepo tooling yet — add npm workspaces when spectator app arrives and shared components actually exist. JWT in localStorage (acceptable for internal admin tool).

## Frontend Architecture

### Structure: 2 apps (planned), shared package (later)

```
apps/operator/             — Operator + Admin app (IMPLEMENTED: admin pages)
  Login → user management (list + create with roles)
  Next: match list → board input UI (speed-optimized)
  Role gate: admin or operator required

apps/spectator/            — Spectator + Commentator app (NOT YET IMPLEMENTED)
  Login → match list → live board display (visual polish)
  Commentator: same view + text commentary input
  Role gate: any authenticated user; commentator features if role present

packages/ui/               — Shared component library (NOT YET — add when spectator app arrives)
  cards, hands, board display, auction box, trick display,
  Centrifugo client wrapper, auth helpers
```

### Why 2 apps, not 4
- **Admin** is rarely used, low-traffic (just forms) → fits in operator app
- **Commentator** is spectator + a text input → fits in spectator app
- Role determines which features are visible within each app

### Why not 1 single SPA
- Operator UI (speed-optimized input, minimal chrome) and spectator UI (polished read-only display) have fundamentally different design priorities
- Separate builds = smaller bundles per role
- Independent deployment (update operator without touching spectator)

### Operator App Details
- **Vite config**: `base: '/operator/'`, dev server on port 5001
- **Routing**: React Router with `basename="/operator"`. Routes: `/login`, `/users`
- **Auth**: `AuthContext` provides `{ user, token, login, logout }`. `ProtectedRoute` checks auth + role. Token stored in localStorage as `vugraph_token`.
- **API calls**: `apiFetch()` wrapper attaches Bearer token, auto-redirects to login on 401. All paths relative (`/api/auth/login`) — nginx routes to backend.
- **Docker**: Vite dev server in node:22-alpine container. Volume mount `src/` only (not node_modules) for HMR.
- **Nginx**: WebSocket upgrade headers on `/operator/` location for Vite HMR through nginx.

## User Preferences

- **Be proactive**: Always create/update CLAUDE.md without being asked. Don't wait for reminders.
- **Don't start the stack**: User prefers to start Docker stack themselves. Don't run `npm run stack` without permission.
- **Safe tokens**: Never hardcode default values for secrets in config. Use `requireEnv()` to fail fast.
- **Short responses**: Keep explanations concise unless detail is requested.

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
