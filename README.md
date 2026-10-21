# cuefield

Overhead 2D pool, 8-ball and 9-ball, with online play, a bot, cues and tables bought with coins.

## Architecture

- `shared/` — physics and rules, imported by both server and browser.
  - Deterministic: only + − × ÷ √ on doubles, integer-quantised stroke input, a seeded integer PRNG for racks.
  - Every engine computes bit-identical results, so the state hash (FNV-1a over the ball positions) detects any desync.
- `backend/` — Hono on Val Town, SQLite.
  - Guest accounts: 256-bit bearer tokens, stored only as SHA-256.
  - Coins, daily streak, shop, Elo, matchmaking with a widening rating window, private rooms.
  - The server replays every stroke itself, so results and payouts are authoritative.
  - Entry fees are escrowed atomically when a match is created. Shot-clock timeouts and forfeits are applied lazily on each poll.
- `frontend/` — vanilla TS client.
  - WebGL2 renderer: two-lamp inverse-square lighting, GGX ball specular, analytic contact shadows, spinning ball orientation.
  - Aim guide built from the real simulator, with line, dotted, chevron and ghost-ball preview methods.
  - Stroke controls as full-height bands: the power band owns every pixel from the left screen edge to the left edge of the table and the precision (fine-aim) band from the right edge of the table to the right screen edge — press anywhere inside a band to drive it. Left-handed play mirrors the bands. Chalk and spin/massé dock in the centre of a compact HUD whose player cards are half-width and pinned into the top corners. Above 80% power an optional two-stop perfect-strike game sets the stroke error.
  - WebRTC data channel for low-latency strokes, live aim and emotes. Signalling and a relay fallback run through the match mailbox.
  - Bot opponent runs in a Web Worker.

## Physics

- Ball state: position, velocity and 3D angular velocity.
- Cloth friction, piecewise exact:
  - Sliding: `u̇ = −(7/2)μs g û`.
  - Rolling: deceleration μr g.
  - Spin about the vertical axis decays at `(5/2R)μsp g`.
- Cue strike: point impulse along an elevated cue axis.
  - Tip offset produces follow, draw and english.
  - Elevation produces massé, swerve and a jump: the ball becomes ballistic, keeps its line through the air, lands with slate restitution and can clear an object ball.
  - Alciatore squirt depends on the shaft's end mass.
- Ball–ball collisions: restitution plus Coulomb throw on contact slip, so both cut-induced and spin-induced throw occur.
  - Contact is three-dimensional, so a raised ball clears or lands on another; the vertical part of the friction impulse is only exchanged when a ball is airborne.
- Cushions: impulse at nose height, with friction acting on contact-point slip.
- Pockets: each mouth is a pair of rounded jaw tips with a tapering funnel. A ball must pass the jaw line and reach the drop circle, so cuts that clip a facing rattle out instead of being swallowed.
- Collisions are found by continuous detection inside 0.5 ms steps.

## Table feel and new ways to play

Ten intrinsic features, all local-first and free (settings under TABLE FEEL and MOTION):

1. **Rail chalk marks** — cushions keep fading scuffs where balls struck wood this rack, like a well-used club table (`shared/physics` rail events now carry the contact point; presentation only).
2. **Cloth whispers** — one line after every settled shot explaining the real mechanics behind it: throw, squirt, stun, draw, follow, massé, rattled jaws, plus rotating table wisdom for quiet shots (`shared/lore.ts`). Every ball also has a nickname (the 8 is *the widow*, the 9 *the money ball*), shown in whispers and on the pocketed-ball gutter.
3. **Bullet time** — playback eases toward 0.3× while a ball closes on a drop circle and snaps back after; physics still steps in fixed slices, so nothing desyncs.
4. **Pocket ledger** — drops vs rattles tallied at each mouth this rack, drawn quietly beside the pockets so you learn which jaws are hungry.
5. **Hot seat · pass & play** — two players, one device, any venue and mode: an opaque curtain hides the table at every hand-over. No coins, no server.
6. **Around the World drill** — twelve stations ringing the table with one ball to drop from each; the run's stroke count is kept against a local personal best.
7. **Trick racks** — six deterministic practice setups (the wall, the wedge, the snake, ouroboros, frozen duo, lone wolf) that repeat the exact same layout until the trick lands (`shapeRack` in `shared/game/rack.ts`).
8. **Railbird badges** — fourteen obscure pool-hall achievements (Golden Break, Jawbreaker, Massé Maestro, Night Owl, The Wall…) tracked on-device with a badge case on the rank tab.
9. **Table talk** — the bot opponent reacts to the run of play with sparing, contextual emotes from the rail's own vocabulary.
10. **Nerves** — a heartbeat vignette and low lub-dub pulse as your shot clock runs under 40%, quickening toward the timeout; respects `prefers-reduced-motion`.

## Setup

TURN (optional): set `TURN_URL` (comma-separated), `TURN_USER` and `TURN_PASS`. Without them, play uses STUN plus the relay.

Local preview (optional): `npm install && npm run dev` serves the frontend through Vite against a mock of the HTTP API (`dev/mock-api.ts`) so practice, drills, trick racks, hot seat and an offline bot match run without the Val Town runtime. Production remains `main.tsx`.

## Rewards and match presentation

- Online and server-verified bot matches automatically settle ten bounties: victory (30c), 3-ball visit (20c), 5-ball visit (45c), double-pot (15c), foul-free win (25c), every third consecutive win (60c), every fifth consecutive win (120c), plus daily two-match (35c), ten-pot (50c), and first-win (40c) contracts. Bounties stack. Daily contracts reset at midnight UTC and pay once per player/day. Match bounties pay once per match. Streaks span bot and online results and reset on losses. At least one shot is required; instant concessions do not qualify.
- `shared/rewards.ts` defines rewards, deterministic per-seat rack stats, highlights, and level thresholds. A visit's consecutive-ball run ends on a miss, foul, or turn change. Scratches, respots, and uncalled shots do not award pots. Practice never awards currency.
- `reward_matches` stores verified progress; `reward_awards` has unique claim keys. A SQLite insert trigger credits bonus coins and XP together, preventing duplicate payouts on repeated settlement. Database triggers prohibit negative balances; fines clamp to zero and apply only after a successful version-guarded match update.
- Each awarded coin is one lifetime XP, including login rewards, daily-rack rewards, pots, and bounties. Fees, purchases, and fines do not subtract XP; abandoned-match escrow refunds do not grant XP. Level n starts at `250 × (n−1)²` XP. New accounts include starting coins. Legacy accounts start from their current nonnegative balance on migration: historical gross earnings cannot be reconstructed from the old net-only records. All subsequent awards are counted exactly.
- The lobby contains a live bounty board and level progress. Bot and online results show both players' shots, pots, fouls, best visit, multi-pot record, and earned bragging highlights, alongside verified bonuses. Each settled shot has a persistent brief recap. Optional browser speech narration can be toggled at the table and is saved locally; no external voice service is required. Unsupported browsers still show all text recaps. Entry transitions respect `prefers-reduced-motion`.

### Verification

Requires Node 22 with its built-in SQLite module:

```sh
npx --yes tsx --test tests/rewards.test.ts tests/physics.test.ts tests/features.test.ts
npx --yes -p typescript tsc --noEmit --allowImportingTsExtensions --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable frontend/main.ts
```

The integration test runs the actual reward settlement code against in-memory SQLite, substituting only the Val Town database transport. It covers duplicate settlement, daily progress/reset, win streaks, zero-shot exclusions, database balance floors, and XP preservation through fines. The deployed backend still requires the Val Town runtime and its hosted SQLite/OAuth imports.
