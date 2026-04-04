# AGENTS.md — Vugraph MVP Coding Guide

Bridge vugraph system: real-time tournament broadcasting with operator input UI, spectator live view, and commentary. This guide helps AI agents understand the architecture, workflows, and conventions needed to be productive.

## Architecture Overview

**Three-tier stack:**

1. **Backend (Node.js + Fastify)** — Pure HTTP service at `:3000`. No WebSocket handling; all real-time via Centrifugo proxy pattern.
2. **Centrifugo (v6)** — Real-time broker. Holds WebSocket connections, manages pub/sub, proxies client RPC calls to backend via HTTP POST.
3. **Frontend (React + Vite)** — Two separate SPAs: operator (admin + input UI) and spectator (live view + commentary).

**Key design**: Backend never touches WebSocket directly. It only receives HTTP POST requests from Centrifugo and publishes back via Centrifugo's HTTP API.

### Backend-to-Centrifugo Communication

Clients → Centrifugo (WebSocket) → Backend (HTTP proxy calls) → Centrifugo HTTP API → Clients (broadcast).

Real-time RPC example: Operator sends bid → Centrifugo calls `POST /centrifugo/rpc` → backend validates with `MatchEngine` → backend publishes result to `match:{id}` channel.

## Critical Files by Concern

| Concern | Key Files |
|---------|-----------|
| **Entry point** | `api/src/server.ts` (Fastify setup + route registration) |
| **Config & secrets** | `api/src/config.ts` (env vars; use `requireEnv()` for secrets) |
| **Match logic** | `api/src/engine/match-engine.ts` (state machine; undo support) |
| **Auction/Play validation** | `api/src/engine/auction.ts`, `play.ts` (pure functions, no I/O) |
| **Centrifugo integration** | `api/src/centrifugo/proxy-handler.ts` (connect/subscribe/rpc routes), `client.ts` (publish API) |
| **Authentication** | `api/src/auth/middleware.ts` (global JWT hook), `jwt.ts` (sign/verify), `password.ts` (bcrypt) |
| **Database layer** | `api/src/db/types.ts` (interface), `database.ts` (Drizzle), `mock-database.ts` (testing) |
| **Shared types** | `packages/types/src/engine.ts`, `auth.ts` (single source of truth for both backend + frontend) |
| **Shared UI** | `packages/ui/src/auth/AuthContext.tsx` (login state), `api.ts` (Bearer token fetch wrapper) |
| **Frontend apps** | `apps/operator/src/App.tsx`, `apps/spectator/src/App.tsx` (React Router routing + role guards) |

## Import Patterns

### Backend (api/)

- **Relative imports from packages**: `../../../packages/types/src/engine.js` (not path aliases; tsc doesn't rewrite them)
- **Import extensions**: Always `.js` (required for tsc emit + ESM; `.ts` would break production)
- **Engine re-export**: `api/src/engine/types.ts` re-exports from `packages/types/src/engine.js` so internal imports stay clean

```typescript
// ✓ Correct: re-export from packages, then import from local types
import type { Card, Seat } from "./types.js"; // → packages/types

// ✓ Correct: relative path to packages
import { ... } from "../../../packages/types/src/engine.js";

// ✗ Avoid: path aliases in backend (tsc doesn't rewrite them)
import { ... } from "@vugraph/types";
```

### Frontend (apps/operator/, apps/spectator/)

- **Path aliases**: `@vugraph/types/*` and `@vugraph/ui` (configured in `vite.config.ts` + `tsconfig.json`)
- **No extensions needed**: Vite resolves `.ts` → `.tsx` automatically

```typescript
// ✓ Correct: path aliases in frontend
import { Card } from "@vugraph/types/engine";
import { AuthProvider } from "@vugraph/ui";

// ✓ Also works: re-export barrel
import { Card, Match } from "@vugraph/types";
```

### Shared Packages (packages/types/, packages/ui/)

- **No dependencies**: `packages/types/` is pure types + constants (used by backend + both frontends)
- **React peer deps**: `packages/ui/` has `react` + `react-router-dom` as peer dependencies
- **Barrel exports**: `packages/types/src/index.ts` and `packages/ui/src/index.ts` for clean imports

## Real-Time Protocol & Centrifugo Integration

### RPC Flow (Operator Actions)

1. Operator calls RPC method through Centrifugo WebSocket: `rpc("call", { seat: "N", bid: "1C" })`
2. Centrifugo proxies to `POST /centrifugo/rpc` with method + params
3. Backend validates JWT from `data.token`, looks up user roles from DB, calls engine
4. Backend publishes result to Centrifugo HTTP API → fans out to all subscribers on `match:{id}`

Key file: `api/src/centrifugo/proxy-handler.ts` handles connect/subscribe/rpc.

### State Channels

- `notifications:global` — broadcast messages (admin-only publish; all users subscribe)
- `match:{matchId}` — match state updates (subscribers see all hands + bids + plays)

### Message Types from Backend

Backend publishes these event types to `match:{matchId}`:

- `state` — full state sync (initial load, after undo)
- `call_made` — bid was recorded
- `card_played` — trick play recorded
- `trick_complete` — trick winner determined
- `board_complete` — result recorded (match to DB)

## Authentication & Authorization

### Flow

1. User logs in → `POST /api/auth/login` → receives JWT
2. JWT stored in localStorage (frontend) or `data.token` (Centrifugo connect)
3. Global `onRequest` hook (`registerAuthHook`) verifies JWT on every non-public route
4. `requireRole(...roles)` preHandler enforces role guards on write operations

### JWT Structure

- Signed with `CENTRIFUGO_TOKEN_SECRET` (HMAC shared with Centrifugo)
- Payload: `{ sub: userId, username, roles, exp: 24h }`
- Verified on backend via `verifyToken(token)` (also used by Centrifugo connect proxy)

### Public Routes

- `POST /api/auth/login` — no auth required
- `GET /api/health` — no auth required
- `/centrifugo/*` — Centrifugo proxy paths (verify JWT themselves)

### Role Guards

```typescript
// Enforce role in route
app.post("/api/matches", { preHandler: [requireRole("admin", "operator")] }, ...);

// Enforce in Centrifugo RPC (manually checked in proxy-handler.ts)
if (!["admin", "operator"].includes(userRoles)) {
  return { error: "Need admin or operator role" };
}
```

## Database Layer (IDatabase Pattern)

Backend uses an interface `IDatabase` for all DB operations. This enables:

- **Testing**: Mock implementation in `mock-database.ts` (in-memory, no Postgres needed)
- **Flexibility**: Swap implementations without changing routes

```typescript
// api/src/db/types.ts defines interface
export interface IDatabase {
  init(): Promise<void>;
  createMatch(match: Omit<Match, "createdAt">): Promise<Match>;
  getMatch(id: string): Promise<Match | null>;
  // ... etc
}

// Tests use mock
const db = new MockDatabase();

// Routes use real Drizzle implementation
const db = new DB(DATABASE_URL);
```

Key: Routes receive `db: IDatabase` parameter and call async methods. No direct SQL.

## Match Engine (Pure Logic)

`api/src/engine/match-engine.ts` — state machine for a single board. Core methods:

- `makeCall(seat, bid)` — validate bid, update auction, return `{ success, contract?, auctionComplete? }`
- `playCard(seat, card)` — validate card, update trick, return `{ success, trickComplete?, trickWinner? }`
- `undo()` — pop undo stack, restore state, return `{ success, undoneAction? }`

**Pattern**: Every method validates state *before* modifying. Errors return `{ success: false, error: "..." }`. No exceptions.

**Undo support**: Each action pushes an `UndoAction` to `undoStack`. Undo pops, restores, publishes new state.

**Board completion**: Scoring happens in engine; result persisted to DB via Centrifugo RPC handler.

## Testing Strategy

- **Unit tests**: `api/tests/engine/*.test.ts` (auction, play, scoring logic)
- **Runner**: `vitest` (configured in `api/vitest.config.ts`)
- **Test env vars**: Set in vitest config (not `.env`), so config.ts doesn't throw

```bash
# From api/ directory
npm test           # run once
npm run test:watch # watch mode
```

**Pattern**: Create `MatchEngine` instances with sample hands, call methods, assert results. Use `MockDatabase` when needed.

## Docker & Local Development

### Services (docker-compose.yml)

1. **nginx** (:80) — reverse proxy; routes `/api/*` → backend, `/operator/*` → operator app, etc.
2. **backend** (:3000) — Fastify service; mounts `api/src` + `packages/types` for HMR
3. **operator** (:5001) — Vite dev server; mounts `apps/operator/src` + shared packages
4. **spectator** (:5002) — Vite dev server; mounts `apps/spectator/src` + shared packages
5. **centrifugo** (:8000) — WebSocket broker; depends on Redis
6. **redis** (:6379) — Centrifugo state (pub/sub, presence, history)
7. **postgres** (:5432) — persistent domain data (matches, boards, users)

### Key Workflow

```bash
# From project root
npm run stack       # Start all 7 services
npm run stack:down  # Stop all services

# From api/ in another terminal (already have Postgres/Centrifugo running)
npm run dev         # Start backend with tsx (hot reload)
npm test            # Run tests

# Seed initial user
npm run db:seed     # Creates "admin" user (default password: "admin", or set SEED_ADMIN_PASSWORD)
```

**HOST mounts**: Backend mounts `api/src` + `packages/types` as volumes for hot reload on file changes.

### Accessing Services Locally

- **Frontend**: http://localhost/operator (redirects to login) and http://localhost/spectator
- **Backend API**: http://localhost/api/* (via nginx reverse proxy)
- **Centrifugo admin**: http://localhost:8000/admin (set credentials in .env)

## Environment Variables

All sensitive config required by backend:

- `CENTRIFUGO_TOKEN_SECRET` — HMAC secret (shared with Centrifugo client auth)
- `CENTRIFUGO_HTTP_API_KEY` — API key for Centrifugo HTTP server API
- `DATABASE_URL` — Postgres connection string

**No default secrets**: `requireEnv()` throws if missing. Fail fast, don't guess.

Copy `example.env` to `.env` and fill in values. Docker Compose reads `.env` and injects into containers.

## Code Ownership & Conventions

### Domain Types (packages/types/)

- **Seat**: `"N" | "E" | "S" | "W"` (cardinal positions, clockwise from dealer)
- **Card**: `"SA" | "SK" | ... | "C2"` (2-char: suit + rank)
- **Bid**: `"1C" | "7NT" | "P" | "X" | "XX"` (level + denom or pass/double/redouble)
- **Vulnerability**: `"None" | "NS" | "EW" | "All"` (determined by board number; see VULNERABILITY_TABLE)

Constants: `SEAT_ORDER`, `DENOMINATION_ORDER`, `RANK_ORDER`, `VULNERABILITY_TABLE` (lookup table for board 1–16 rotation).

### API Response Format

- **Success**: `{ success: true, [result fields] }`
- **Error**: `{ success: false, error: "message" }`
- **HTTP**: Use reply codes (201 for create, 404 for not found, 403 for forbidden)

### Frontend Components

- **ProtectedRoute**: Wrap routes requiring role guards
- **AuthProvider**: Wrap app root; provides `useAuth()` hook
- **CentrifugoProvider**: Wrap app root (after AuthProvider); manages WebSocket + subscriptions

## Deployment & Production Build

### Production Dockerfiles

- `api/Dockerfile.deploy` — multi-stage: tsc compile → node runtime; copies `_shared/` (packages prepared by prepare-build.sh)
- `apps/operator/Dockerfile.deploy` — Vite build → nginx static server
- `apps/spectator/Dockerfile.deploy` — Vite build → nginx static server

### Build Preparation

```bash
scripts/prepare-build.sh <app>  # Copies packages/types + packages/ui → apps/<app>/_shared/
scripts/prepare-build.sh api    # Copies packages/types → api/_shared/
```

Each app's build context is isolated (just the app dir + _shared/). This enables independent Docker builds without monorepo tooling.

### Cloud Architecture (AWS, documented in docs/architecture.pdf)

- CloudFront → ALB (routes /api/* to Backend ECS, /connection/* to Centrifugo ECS, /operator/* and /spectator/* to S3)
- RDS PostgreSQL, ElastiCache Redis replace local Docker services
- Same backend code; only outer routing wrapper changes

## Common Tasks & Patterns

### Adding a New REST Route

1. Create route function in `api/src/api/my-feature.ts`
2. Register in `server.ts`: `myFeatureRoutes(app, db)`
3. Use type-safe Fastify generics: `app.post<{ Body: {}, Params: {} }>(...)`
4. Wrap preHandler with `requireRole(...)` if needed
5. Always use `db: IDatabase` interface (not direct SQL)

### Adding Centrifugo RPC Handler

1. Add case in `/centrifugo/rpc` proxy handler
2. Verify JWT + user roles (already parsed)
3. Call engine method or DB operation
4. Publish result via `broadcastToMatch(matchId, eventType, data)`
5. Return Centrifugo RPC response: `{ result: {...} }` or `{ error: {...} }`

### Testing Engine Logic

1. Create engine: `new MatchEngine(matchId, boardNumber, dealer, vulnerability, hands)`
2. Call methods: `engine.makeCall(seat, bid)`, `engine.playCard(seat, card)`
3. Assert result: `expect(result.success).toBe(true)`
4. Check state: `engine.board.auction`, `engine.board.tricks`

### Frontend: Adding Protected Route

```typescript
<Route
  path="/my-feature"
  element={
    <ProtectedRoute requiredRole="operator">
      <MyFeaturePage />
    </ProtectedRoute>
  }
/>
```

`ProtectedRoute` redirects to login if not authenticated or missing required role.

### Frontend: Using Auth Context

```typescript
const { user, login, logout } = useAuth();
// user: { id, username, roles }
// login(username, password) → sets token, populates user
// logout() → clears token, clears user
```

## Gotchas & Important Notes

1. **Import extensions**: Backend requires `.js` for tsc emit (production build). Vite frontends resolve `.ts` automatically.
2. **Path aliases**: Frontend uses them; backend doesn't (tsc limitation).
3. **Centrifugo JWT**: Same `CENTRIFUGO_TOKEN_SECRET` signs both REST JWT and WebSocket JWT. Not two separate secrets.
4. **Undo stack**: Lives in-memory on `MatchEngine`. Survives board changes *within a session*, but lost on server restart. Good for session-local undo; not persisted.
5. **LOCAL_DEV**: Hardcoded in docker-compose.yml, NOT in .env. Always `true` under Docker Compose.
6. **Role lookup**: Centrifugo RPC handlers look up user roles from DB by parsed user ID. Make sure roles are seeded before testing.
7. **No refresh tokens**: JWT expires in 24h; on expiry, user logs in again (MVP simplification).
8. **Database schema**: Created idempotently by `db.init()` on backend startup. Drizzle migrations not used yet (schema.sql is manual).

## Useful Commands

```bash
# From project root
npm run stack               # Start all services
npm run stack:down          # Stop all services
npm run db:seed             # Seed admin user (requires Postgres running)

# From api/
npm run dev                 # Start backend dev server (needs Postgres + Centrifugo)
npm test                    # Run tests (no external deps needed)
npm run test:watch          # Watch mode
npx tsc --noEmit            # Type-check without emit

# From apps/operator/ or apps/spectator/
npm run dev                 # Start Vite dev server (needs to be inside Docker or have packages mounted)

# From any app with Drizzle
npm run db:generate         # Generate migration file
npm run db:migrate          # Apply migrations
npm run db:studio           # Open Drizzle Studio (visual DB browser)
```

## Decision History

- **Why Centrifugo + proxy pattern?** Keeps backend pure HTTP, simplifies deployment. No long-lived connections on backend.
- **Why IDatabase interface?** Enables testability without external dependencies. Mock implementation for unit tests.
- **Why path aliases frontend-only?** tsc doesn't rewrite aliases in emitted JS; backend uses relative paths to avoid breaking production.
- **Why shared packages not npm workspaces?** Avoids symlinks in Docker; simpler local setup. Each consumer resolves via tsconfig + vite.config.
- **Why prepare-build.sh?** Each Docker build is isolated (single app context); script copies shared code before building. Avoids monorepo complexity.
- **Why CENTRIFUGO_TOKEN_SECRET shared?** Single secret simplifies config; same HMAC signs REST JWT and Centrifugo client JWT.

