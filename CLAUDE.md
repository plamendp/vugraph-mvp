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
    |-- /operator/*               --> operator (:5001)
    |-- /spectator/*              --> spectator (:5002)
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
      types.ts             — Re-exports from packages/types (relative import)
      card-utils.ts        — Card/bid parsing, seat helpers, vulnerability lookup
      auction.ts           — Auction validation and contract determination
      play.ts              — Play validation and trick winner logic
      scoring.ts           — Duplicate bridge scoring + IMP conversion
      match-engine.ts      — Central state machine (MatchEngine class)
    centrifugo/            — Centrifugo integration
      client.ts            — HTTP client for Centrifugo server API (publish, etc.)
      proxy-handler.ts     — Fastify routes for connect/subscribe/rpc proxy
    auth/                  — Authentication & authorization
      types.ts             — Re-exports RoleName/ALL_ROLES from packages/types; local User, JwtPayload
      password.ts          — bcrypt hash/verify (10 salt rounds)
      jwt.ts               — JWT sign/verify (HMAC with CENTRIFUGO_TOKEN_SECRET, 24h expiry)
      middleware.ts         — Global JWT hook + requireRole preHandler
    api/                   — REST API
      auth.ts              — Login, register (admin-only), me routes
      matches.ts           — Match CRUD routes (write ops: admin/operator only)
      boards.ts            — Board routes (write ops: admin/operator only)
      broadcast.ts         — POST /api/broadcast (admin-only, publishes to Centrifugo)
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
  Dockerfile               — Dev container (tsx, no build step)
  Dockerfile.deploy        — Production multi-stage build (tsc + node)
  package.json             — Backend dependencies and scripts
  tsconfig.json
  vitest.config.ts         — Test config (includes env vars for tests)
  drizzle.config.ts
centrifugo/
  config.json              — Centrifugo configuration
nginx/
  nginx.conf               — Reverse proxy config
example.env                — Env var template (cp to .env, fill secrets)
packages/
  types/                   — Shared pure types and constants (@vugraph/types)
    src/
      index.ts             — Barrel export
      engine.ts            — Domain types: Seat, Card, Match, BoardState, etc. + constants
      auth.ts              — RoleName, ALL_ROLES, UserInfo
    package.json
    tsconfig.json
  ui/                      — Shared frontend library (@vugraph/ui)
    src/
      index.ts             — Barrel export
      auth/
        api.ts             — Fetch wrapper (Bearer token, configurable 401 redirect)
        AuthContext.tsx     — Auth state (user, token, login, logout)
        ProtectedRoute.tsx — Redirect if not authenticated / wrong role
        types.ts           — Re-exports from @vugraph/types/auth
      centrifugo/
        CentrifugoContext.tsx — Centrifugo client (auto-connect on login, notifications channel)
        NotificationBar.tsx   — Toast-style notification display
    package.json           — Peer deps: centrifuge, react, react-router-dom
    tsconfig.json
apps/
  operator/                — Operator + Admin frontend (React + Vite)
    src/
      main.tsx             — Entry point (configureAuth, BrowserRouter, AuthProvider)
      App.tsx              — Routes: /login, /users (protected)
      styles.css           — MVP styling (blue accent)
      pages/
        LoginPage.tsx      — Login form
        UsersPage.tsx      — User list table + create user form
    Dockerfile             — Vite dev server container (local dev)
    Dockerfile.deploy      — Multi-stage production build (nginx + static)
    package.json
    vite.config.ts         — base: /operator/, aliases @vugraph/ui + @vugraph/types, port 5001
    tsconfig.json          — paths: @vugraph/ui, @vugraph/types
  spectator/               — Spectator + Commentator frontend (React + Vite)
    src/
      main.tsx             — Entry point (configureAuth, BrowserRouter, AuthProvider)
      App.tsx              — Routes: /login, /matches
      styles.css           — MVP styling (green accent)
      pages/
        LoginPage.tsx      — Login form
        MatchListPage.tsx  — Match list (cards), commentator role detected
    Dockerfile             — Vite dev server container (local dev)
    Dockerfile.deploy      — Multi-stage production build (nginx + static)
    package.json
    vite.config.ts         — base: /spectator/, aliases @vugraph/ui + @vugraph/types, port 5002
    tsconfig.json          — paths: @vugraph/ui, @vugraph/types
scripts/
  prepare-build.sh         — Copies packages/ui + packages/types into app for isolated Docker builds
docs/
  architecture.pdf         — System architecture diagram (AWS + Local, 2-page PDF)
docker-compose.yml         — Local 7-service stack
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
- `CENTRIFUGO_HTTP_API_KEY` — API key for Centrifugo server API (required)
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
- `POST /api/broadcast` — admin-only, sends notification to all connected WebSocket clients

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
- Admin frontend (apps/operator/) — login page, user management (list + create with roles), broadcast messages
- Spectator frontend (apps/spectator/) — login page, match list (commentator role detected)
- Shared types package (packages/types/) — domain types, auth types, constants (single source of truth)
- Shared UI package (packages/ui/) — auth context, protected route, API fetch wrapper, Centrifugo client
- Centrifugo WebSocket integration: both apps auto-connect on login, subscribe to notifications channel
- Admin broadcast: POST /api/broadcast sends message to all connected clients via Centrifugo
- Docker infrastructure: 7 services (nginx, backend, centrifugo, redis, postgres, operator, spectator)
- .env-based secrets management with example.env template
- Admin seed script (npm run db:seed — runs from host against containerized Postgres)
- Deployment tooling: prepare-build.sh copies shared code for isolated Docker builds
- 69 tests, all passing

**Not yet implemented:**
- Operator board input UI (lives in apps/operator/, admin shell is done)
- Spectator live board view (WebSocket connection to Centrifugo, board rendering)
- Commentator text input (visible in spectator app when user has commentator role)
- File import (.pbn, .dup, .lin)
- AWS deployment (CDK) — architecture planned, see docs/architecture.pdf

**AWS deployment architecture** (planned, documented in docs/architecture.pdf):
- CloudFront: SSL termination, CDN, routes /operator/* and /spectator/* to S3, everything else to ALB
- ALB: path-based routing — /api/* to Backend ECS, /connection/* to Centrifugo ECS
- ECS Cluster: Backend (API) and Centrifugo as separate Fargate services
- RDS PostgreSQL (Multi-AZ) replaces local Postgres
- ElastiCache Redis replaces local Redis
- S3: hosts operator and spectator SPAs as static sites
- Same backend code as local — only infrastructure wrapper changes

## Decisions Made

- **ORM**: Drizzle ORM (TypeScript-native, lightweight, SQL-like)
- **WebSocket broker**: Centrifugo v6 (proxy pattern — backend stays pure HTTP)
- **Redis**: Used by Centrifugo for pub/sub + presence + history; backend does NOT use Redis directly
- **Auth**: JWT using CENTRIFUGO_TOKEN_SECRET as shared HMAC secret (single secret for both REST auth and Centrifugo client auth); bcrypt for password hashing; 24h token expiry; no refresh tokens (MVP)
- **Host-to-container tooling**: npm scripts in root package.json source .env and connect to localhost-exposed ports (e.g., db:seed connects to Postgres on localhost:5432)
- **Testing strategy**: IDatabase interface + in-memory mock for unit tests; vitest.config.ts sets required env vars (DATABASE_URL, CENTRIFUGO_TOKEN_SECRET, CENTRIFUGO_HTTP_API_KEY) so config.ts doesn't throw during test imports
- **LOCAL_DEV**: Hardcoded `LOCAL_DEV=true` in docker-compose.yml, NOT in .env (it's always true under Docker Compose)
- **No default secrets**: All sensitive config uses `requireEnv()` which throws if the env var is missing — no fallback defaults for secrets
- **Frontend**: React + Vite + TypeScript, plain CSS (MVP). JWT in localStorage (acceptable for internal tool).
- **Code sharing**: Two shared packages — `packages/types/` (pure types + constants, no deps) and `packages/ui/` (React components). TypeScript path aliases (`@vugraph/types/*`, `@vugraph/ui`), no npm workspaces/symlinks. Each consumer's tsconfig + vite.config resolves aliases. `packages/ui/` has its own `node_modules` with React types so TypeScript resolves correctly. For deployment, `scripts/prepare-build.sh` copies both packages into the app dir so Docker can build with per-app context.
- **Backend module resolution**: `bundler` (not `NodeNext`). The api runs through `tsx` for dev, which handles resolution transparently. This avoids mandatory `.js` extensions. Existing `.js` import extensions are harmless and work fine with `bundler`. The api uses **relative paths** (not path aliases) to import from `packages/types/` because `tsc` doesn't rewrite path aliases in emitted JavaScript — relative paths work at both compile time and runtime.
- **Backend Docker**: Dev Dockerfile uses `tsx` (no build step); `packages/types` provided via volume mount (must mount full `packages/types/` dir, not just `src/`, because Node needs `package.json` with `"type": "module"` for ESM resolution). Production `Dockerfile.deploy` uses `tsc`; `prepare-build.sh api` copies `packages/types` into `api/_shared/` first. Same local-context pattern as frontend apps.
- **Import extensions**: Backend uses `.js` extensions in imports (e.g., `from "./types.js"`). These are required for `tsc` emit — `tsc` doesn't rewrite extensions, so `.ts` extensions would break the production build. `tsx` and `vitest` handle `.js` → `.ts` resolution transparently in dev/test.

## Frontend Architecture

### Structure: 2 apps + 2 shared packages

```
packages/types/            — Shared pure types + constants (@vugraph/types)
  Domain: Seat, Card, Match, BoardState, etc.
  Auth: RoleName, ALL_ROLES, UserInfo
  No dependencies — consumed by both api/ and frontend apps

packages/ui/               — Shared React component library (@vugraph/ui)
  Auth helpers (AuthContext, ProtectedRoute, apiFetch, configureAuth)
  Re-exports types from @vugraph/types
  Later: card/board components, Centrifugo client wrapper

apps/operator/             — Operator + Admin app
  Login → user management (list + create with roles)
  Next: match list → board input UI (speed-optimized)
  Role gate: admin or operator required

apps/spectator/            — Spectator + Commentator app
  Login → match list (→ live board view, not yet)
  Commentator: same view + text commentary input (not yet)
  Role gate: any authenticated user; commentator features if role present
```

### Why 2 apps, not 4
- **Admin** is rarely used, low-traffic (just forms) → fits in operator app
- **Commentator** is spectator + a text input → fits in spectator app
- Role determines which features are visible within each app

### Why not 1 single SPA
- Operator UI (speed-optimized input, minimal chrome) and spectator UI (polished read-only display) have fundamentally different design priorities
- Separate builds = smaller bundles per role
- Independent deployment (update operator without touching spectator)

### Code Sharing Approach
- **No npm workspaces, no symlinks** — pure TypeScript path aliases
- Two shared packages: `@vugraph/types` (pure types/constants) and `@vugraph/ui` (React components)
- Each consumer's `tsconfig.json`: `"paths": { "@vugraph/types/*": ["../../packages/types/src/*"], "@vugraph/ui": ["../../packages/ui/src/index.ts"] }`
- Each consumer's `vite.config.ts`: `resolve.alias` for both `@vugraph/types` and `@vugraph/ui`
- `api/` uses relative paths (`../../../packages/types/src/...`) instead of path aliases (tsc doesn't rewrite aliases in emitted JS)
- `packages/ui/` has its own `node_modules` with React types (devDependencies) so TypeScript resolves types correctly
- `tsconfig.json` `include` covers `src`, `../../packages/ui/src`, and `../../packages/types/src`
- **Local dev**: Vite resolves aliases at runtime; Docker mounts `app/src`, `packages/ui/src`, and `packages/types/src` as volumes
- **Deployment**: `scripts/prepare-build.sh <app>` copies both `packages/ui/` and `packages/types/` → `apps/<app>/_shared/`. `Dockerfile.deploy` COPYs them to `/app/packages/`. Build context is just the app dir. `_shared/` is gitignored.

### Operator App Details
- **Vite config**: `base: '/operator/'`, dev server on port 5001
- **Routing**: React Router with `basename="/operator"`. Routes: `/login`, `/users`
- **Auth**: Shared `AuthContext` from `@vugraph/ui`. `configureAuth({ loginPath: "/operator/login" })` called in main.tsx.
- **Docker**: Vite dev server in node:22-alpine container. WORKDIR `/app/apps/operator` mirrors repo layout. Volume mounts `src/` and `packages/ui/src` for HMR.
- **Nginx**: WebSocket upgrade headers on `/operator/` location for Vite HMR through nginx.

### Spectator App Details
- **Vite config**: `base: '/spectator/'`, dev server on port 5002
- **Routing**: React Router with `basename="/spectator"`. Routes: `/login`, `/matches`
- **Auth**: Same shared `AuthContext`. `configureAuth({ loginPath: "/spectator/login" })`.
- **Styling**: Green accent (vs blue for operator) — visually distinct apps.
- **Commentator detection**: `user.roles.includes("commentator")` shown in header. Commentary input to be added later.

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
