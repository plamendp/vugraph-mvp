# Bridge Vugraph — Project Specification

## 1. What Is This Project?

A **web-based Vugraph system** for broadcasting contract bridge matches in real time.
"Vugraph" is the bridge world's term for live broadcasting of tournament play to an audience.

### Roles
- **Operator**: Sits near the players at a tournament table. Inputs bids and card plays into the system as they happen. Needs a specialized input UI optimized for speed and accuracy.
- **Spectator**: Connects via browser to watch the match live. Sees all four hands, the auction, trick play, score, and commentary.
- **Commentator** (stretch goal): An expert who provides text commentary alongside the live action.

### Why build this?
The dominant existing system is Bridge Base Online (BBO), which uses a proprietary Windows desktop client for operators. This project aims to build a modern, open, web-based alternative.

---

## 2. Domain Model — Contract Bridge Basics

If you're not familiar with bridge, here's what you need to know to build this:

### The Deal
- Standard 52-card deck, 4 suits: Spades (♠), Hearts (♥), Diamonds (♦), Clubs (♣)
- 4 players seated at compass positions: North, East, South, West
- North-South are partners vs East-West
- Each player receives 13 cards
- **Vulnerability**: Each side is either "vulnerable" or "not vulnerable" (affects scoring). Determined by board number.
- **Dealer**: The player who bids first. Rotates: board 1=N, board 2=E, board 3=S, board 4=W, then repeats.

### The Auction (Bidding)
- Starts with the dealer, proceeds clockwise
- A bid consists of a **level** (1-7) and a **denomination** (Clubs, Diamonds, Hearts, Spades, No Trump)
    - Denominations rank: C < D < H < S < NT
    - Each bid must be higher than the previous (higher level, or same level + higher denomination)
- Special calls: **Pass**, **Double** (of opponent's last bid), **Redouble** (of opponent's double)
- Auction ends after 3 consecutive passes (following at least one bid), or 4 passes if no one bids
- The final bid becomes the **contract** (e.g., "4♠" or "3NT")
- The **declarer** is the first player of the contracting side to have named the contract's denomination
- The player to declarer's left is the **opening leader**

### The Play
- 13 tricks are played
- Opening leader plays first card; then declarer's partner (the "dummy") lays cards face-up
- Players must follow suit if possible; otherwise may play any card
- Highest card of the led suit wins the trick, unless a trump (the contract's suit) was played
- In No Trump contracts, there is no trump suit
- Winner of each trick leads to the next

### Scoring
- Complex but well-defined. For Vugraph purposes, the operator typically enters the final result.
- In team matches (most common for Vugraph), scoring is in IMPs (International Match Points)
- A match consists of multiple **boards** (deals), grouped into **segments** (sets of boards)

---

## 3. Architecture

### Tech Stack (Recommended)
- **Backend**: Node.js with TypeScript
- **Framework**: Fastify (lightweight, fast) or Express
- **Real-time**: WebSocket (via `ws` library) — bidirectional for operators, broadcast to spectators
- **Database**: SQLite (simple, file-based, good enough for MVP) via `better-sqlite3`
- **Operator Client**: React + TypeScript SPA

### System Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────────┐
│  Operator Client │ ◄──────────────► │                      │
│  (React SPA)     │   (bidirectional)  │    Backend Server     │
└─────────────────┘                    │    (Node.js + WS)     │
                                       │                      │
┌─────────────────┐     WebSocket      │  ┌────────────────┐  │
│  Spectator Client│ ◄───────────────  │  │  Match Engine   │  │
│  (future)        │   (server→client)  │  │  (game state +  │  │
└─────────────────┘                    │  │   validation)   │  │
                                       │  └────────────────┘  │
┌─────────────────┐     WebSocket      │  ┌────────────────┐  │
│  Commentator     │ ◄──────────────► │  │  SQLite DB      │  │
│  (future)        │                    │  └────────────────┘  │
└─────────────────┘                    └──────────────────────┘
```

### WebSocket Protocol

All messages are JSON with a `type` field:

#### Operator → Server
```jsonc
// Authenticate
{ "type": "auth", "token": "...", "role": "operator" }

// Load a board/deal
{ "type": "load_board", "matchId": "...", "boardNumber": 1, "dealer": "N", "vulnerability": "NS",
  "hands": { "N": ["SA","SK","SQ",...], "E": [...], "S": [...], "W": [...] } }

// Make a call (bid/pass/double/redouble)
{ "type": "call", "seat": "N", "call": "1S" }
// call values: "P" (pass), "X" (double), "XX" (redouble), or "1C".."7NT"

// Play a card
{ "type": "play", "seat": "E", "card": "HA" }
// card format: <suit><rank> where suit=S/H/D/C, rank=A/K/Q/J/T/9/8/7/6/5/4/3/2

// Undo last action
{ "type": "undo" }

// Set result manually (e.g., claim)
{ "type": "set_result", "declarer": "N", "contract": "4S", "tricks": 10 }
```

#### Server → All Clients (broadcast)
```jsonc
// Full state sync (on connect or after major change)
{ "type": "state", "match": { ... }, "board": { ... }, "auction": [...], "play": [...], "phase": "auction|play|complete" }

// Incremental updates
{ "type": "call_made", "seat": "N", "call": "1S" }
{ "type": "card_played", "seat": "E", "card": "HA" }
{ "type": "trick_complete", "winner": "N", "trickNumber": 3 }
{ "type": "board_complete", "result": { ... } }
{ "type": "undo_performed", "newState": { ... } }
```

---

## 4. Data Models

### Match
```typescript
interface Match {
  id: string;
  title: string;           // "World Championship Final"
  segment: string;          // "Set 3, Boards 33-48"
  homeTeam: string;
  awayTeam: string;
  status: "pending" | "live" | "complete";
  createdAt: string;
}
```

### Board
```typescript
interface Board {
  matchId: string;
  boardNumber: number;
  dealer: Seat;             // "N" | "E" | "S" | "W"
  vulnerability: Vulnerability; // "None" | "NS" | "EW" | "All"
  hands: Record<Seat, Card[]>;
  phase: "setup" | "auction" | "play" | "complete";
}
```

### Card
```typescript
type Suit = "S" | "H" | "D" | "C";
type Rank = "A" | "K" | "Q" | "J" | "T" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
type Card = `${Suit}${Rank}`;  // e.g. "SA" = Ace of Spades
```

### Auction
```typescript
type BidLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type Denomination = "C" | "D" | "H" | "S" | "NT";
type Call = "P" | "X" | "XX" | `${BidLevel}${Denomination}`;

interface AuctionEntry {
  seat: Seat;
  call: Call;
}
```

### Play
```typescript
interface PlayEntry {
  seat: Seat;
  card: Card;
  trickNumber: number;
}

interface Trick {
  number: number;
  cards: PlayEntry[];  // 4 cards
  leader: Seat;
  winner?: Seat;
}
```

---

## 5. Match Engine — Core Logic

The Match Engine is the heart of the backend. It maintains game state and validates all actions.

### Key Rules to Implement

**Auction Validation:**
- Only the current turn's player can make a call
- A bid must be higher than the last bid (higher level, or same level with higher denomination)
- Double: only allowed if last non-pass call was a bid by an opponent
- Redouble: only allowed if last non-pass call was a double by an opponent
- Auction ends: 3 passes after a bid, or 4 passes with no bid (passed-out board)
- Determine contract, declarer, and dummy from completed auction

**Play Validation:**
- Opening lead is by the player to declarer's left
- After opening lead, dummy's hand is revealed
- Must follow suit if able
- Dummy's cards are played by declarer (but operator inputs them as dummy's seat)
- Trick winner: highest trump if any trumps played, else highest card of led suit
- Winner of trick leads next

**Undo:**
- Must support undoing the last action (critical for operator mistakes)
- Stack-based: push each action, pop to undo

---

## 6. File Format Support (Stretch Goal)

### .dup (Duplimate)
Standard format from dealing machines. Simple text format, one line per hand.

### .pbn (Portable Bridge Notation)
Industry standard. Key tags:
```
[Board "1"]
[Dealer "N"]
[Vulnerable "None"]
[Deal "N:AKQ2.T87.A93.K42 J985.AK3.KT7.A85 T743.Q92.QJ4.QT6 6.J654.8652.J973"]
```
Deal string format: `<first_seat>:<hand> <hand> <hand> <hand>` where hands are separated by spaces, suits within a hand by dots (spades.hearts.diamonds.clubs), going clockwise from the first seat.

### .lin (BBO native)
BBO's format for storing complete match records with bidding and play.

---

## 7. MVP Scope

### Must Have (Phase 1)
1. **Backend server** with WebSocket support
2. **Match engine** with full auction + play validation
3. **REST API** for match/board CRUD
4. **Operator client** (React):
    - Create/manage matches
    - Input hands manually (later: import from files)
    - Bidding box UI (click to bid)
    - Card play UI (click cards to play them)
    - Undo button
    - See current state at all times
5. **Spectator WebSocket** that broadcasts all state changes
6. **Simple auth** (operator token, spectators anonymous)

### Nice to Have (Phase 2)
7. File import (.pbn, .dup)
8. Spectator client
9. Text commentary system
10. Match archive / replay
11. Multiple simultaneous tables (e.g., Open Room + Closed Room)
12. Score comparison between tables (IMP calculation)

---

## 8. Project Structure

```
bridge-vugraph/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts              # Entry point, Fastify + WS setup
│   ├── config.ts              # Environment config
│   ├── engine/
│   │   ├── types.ts           # All type definitions
│   │   ├── match-engine.ts    # Core game state machine
│   │   ├── auction.ts         # Auction validation logic
│   │   ├── play.ts            # Play validation logic
│   │   ├── scoring.ts         # Bridge scoring calculations
│   │   └── card-utils.ts      # Card parsing, comparison, etc.
│   ├── ws/
│   │   ├── handler.ts         # WebSocket message router
│   │   ├── rooms.ts           # Match rooms (operator + spectators)
│   │   └── protocol.ts        # Message type definitions
│   ├── api/
│   │   ├── matches.ts         # REST routes for match CRUD
│   │   └── boards.ts          # REST routes for board management
│   ├── db/
│   │   ├── schema.sql         # SQLite schema
│   │   └── database.ts        # DB access layer
│   └── parsers/               # (Phase 2) File format parsers
│       ├── pbn.ts
│       ├── dup.ts
│       └── lin.ts
├── operator-client/           # React SPA
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx
│   │   ├── hooks/
│   │   │   └── useVugraph.ts  # WebSocket hook
│   │   ├── components/
│   │   │   ├── MatchManager.tsx
│   │   │   ├── HandDisplay.tsx
│   │   │   ├── BiddingBox.tsx
│   │   │   ├── AuctionTable.tsx
│   │   │   ├── TrickArea.tsx
│   │   │   └── ScoreSheet.tsx
│   │   └── types.ts           # Shared types
│   └── index.html
└── tests/
    ├── engine/
    │   ├── auction.test.ts
    │   └── play.test.ts
    └── ws/
        └── protocol.test.ts
```

---

## 9. Key Implementation Notes

### Operator Client UX Priorities
- **Speed**: Operators must keep up with fast card play. Minimize clicks.
- **Undo**: Prominent, always available. Mistakes happen under pressure.
- **Keyboard shortcuts**: Support keyboard input for experienced operators (e.g., "1S" to bid 1 Spade, "HA" to play Ace of Hearts).
- **Visual clarity**: Current turn, last bid, trick count, vulnerability — all visible at a glance.
- **Mobile-unfriendly is OK**: Operators use laptops at the table.

### Card Notation Convention
Use 2-character codes throughout the system:
- Suit: `S` (Spades), `H` (Hearts), `D` (Diamonds), `C` (Clubs)
- Rank: `A`, `K`, `Q`, `J`, `T` (ten), `9`, `8`, `7`, `6`, `5`, `4`, `3`, `2`
- Examples: `SA` = Ace of Spades, `HT` = Ten of Hearts, `C2` = Two of Clubs

### Bid Notation Convention
- Pass: `P`
- Double: `X`
- Redouble: `XX`
- Bids: `<level><denomination>` — e.g., `1C`, `2NT`, `7S`
- Denomination order (low to high): `C`, `D`, `H`, `S`, `NT`

### Vulnerability by Board Number
Standard 16-board rotation:
```
Board:  1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16
Vul:   None  NS   EW  All   NS   EW  All  None  EW  All  None  NS  All  None  NS   EW
Dealer:  N    E    S    W    N    E    S    W    N    E    S    W    N    E    S    W
```
For board numbers > 16, use `(boardNumber - 1) % 16 + 1` to map back.

### Scoring Reference
Duplicate bridge scoring is complex. For MVP, let the operator enter the result (tricks taken). Implement automated scoring in Phase 2. Key concepts:
- **Trick score**: Based on denomination and level
- **Overtricks/undertricks**: Bonus or penalty points
- **Game bonus**: 300 (not vul) or 500 (vul) for contracts worth 100+ trick points
- **Slam bonus**: 500/750 (small slam), 1000/1500 (grand slam)
- **IMP conversion**: A standard table converts point differences to IMPs (0-24 scale)

---

## 10. Getting Started

```bash
# Initialize project
mkdir bridge-vugraph && cd bridge-vugraph
npm init -y
npm install typescript fastify ws better-sqlite3 uuid
npm install -D @types/node @types/ws @types/better-sqlite3 tsx vitest

# Start with:
# 1. Define types (src/engine/types.ts)
# 2. Build the match engine with auction + play validation
# 3. Add WebSocket server
# 4. Build operator client
# 5. Test with a sample deal
```