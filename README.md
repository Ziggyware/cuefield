# cuefield

Overhead 2D pool with 8-ball, 9-ball, 10-ball and rotation, online play, a bot, and cues and tables bought with coins.

## Architecture

- `shared/` — physics and rules, imported by both server and browser.
  - Deterministic: only + − × ÷ √ on doubles, integer-quantised stroke input, a seeded integer PRNG for racks.
  - Every engine computes bit-identical results, so the state hash (FNV-1a over the ball positions) detects any desync.
- `backend/` — the same Hono API on Val Town or the standalone Node server, with SQLite.
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

For a player-facing assessment and a proposed parallel-agent roadmap, see [Player experience and longevity roadmap](docs/PLAYER_EXPERIENCE_AND_ROADMAP.md).

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


## Table physics, prediction and replays

A low ball entering the pocket's visible lip is captured before the off-table check; fast balls are swept across the drop rather than checked only at their endpoints. Jaw contacts still reject wide shots, and a ball high enough to clear a pocket can leave the table. An actual off-table ball is a foul: object balls are respotted, except that an 8-ball off the table after the break loses the rack.

A ball leaving the table, a jump, a multi-pot or a winning shot triggers one automatic event-focused replay (in that priority order). It follows the subject at 2.2× zoom and 0.4× speed, with **two seconds of locked controls before and after**. The authoritative table is never rewound and the turn/result is delivered after the replay. Turn off **Special-event replays** in Settings if desired; manual last-shot replay remains available through its existing unlock. Online and spectator views resynchronize with the server if another player advances while a replay is playing. The shot clock includes an eight-second highlight allowance; a backgrounded tab or an unusually slow device can still exceed that finite allowance.

New racks use less seeded stroke error by default, normal play runs at 1.3× by default, and the guide uses the same seeded stroke, chalk and pocket tolerance as the shot. Prediction runs the bounded shared simulation through rest in a worker, with at most one active and one replaceable pending request; if workers are unavailable it falls back to the main thread. Guide detail and playback speed remain configurable.

### Determinism and bounds

The shared client/server engine uses fixed 1/2000-second steps, continuous collision times and a swept pocket test. The rationalized quadratic root avoids cancellation at grazing contacts. Per collision pass, the broad phase is O(N² + N·G) for N balls and G table features; the step is capped at 96 contact iterations and a shot at 40 simulated seconds. A zero-time collision loop consumes the remaining step rather than hanging. Replay recording is bounded to about 30 snapshots per simulated second and never modifies the live state.

**Compatibility:** new racks carry physics version 2. Existing matches and saved match logs without a version use the frozen version-1 simulator and stroke error; existing bot entries retain their original version. The already-running UTC Daily Rack also stays on version 1 until the next day, so its leaderboard and late submissions share one simulation. Refresh old browser tabs before starting new online matches after deployment. **Rollback hazard:** a pre-update server cannot reproduce version-2 matches or solo logs; finish or cancel those sessions and the current Daily Rack before rolling the engine back.

### Practice mini-games

- **Six-pocket tour:** sink the 1 in each highlighted pocket, in order, using as few shots as possible.
- **Bank school:** bank the object ball off a cushion before sinking it at six stations; missed or invalid attempts add to the score.
- **Three-ball sprint:** clear three object balls in at most five shots without a foul.

The mini-games save personal bests per table, allow retries and do not award coins.

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

## Run standalone

Node 22.12 or newer is required for its built-in SQLite support. Install dependencies and run the real API and frontend together:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite serves the frontend in development; `/api` uses the actual Hono backend, not a mock. Matchmaking, private rooms, server-verified bot and online matches, purchases and rewards use the SQLite database at `data/cuefield.sqlite`. The directory is gitignored and a new database is created with owner-only file permissions. Set `CUEFIELD_DB` to an absolute path or a path relative to the working directory to use another database (not `:memory:` or inside the public `dist/` directory); `PORT` and `HOST` override the defaults `5173` and `0.0.0.0`.

For built frontend assets instead of Vite middleware:

```sh
npm ci
npm run build
npm start
```

Standalone **guest accounts are real but browser-bound**: the server stores the profile and progress in SQLite, while the browser stores the sign-in key. Clearing the browser's site data loses access to that guest account; there is no password recovery or cross-device login. Standalone has its own database and does not provide Val Town OAuth or access to hosted Val Town accounts. Use separate browsers or private windows to play multiple accounts. Back up the database by stopping the server before copying it, or by using SQLite's backup facilities. Node may print an experimental SQLite warning.

The standalone driver serializes database operations during a transaction. Matchmaking admission and escrow, online and bot settlement, and daily-rack credits commit with their corresponding game records or roll back together. Run one standalone server process per database. The Val Town transport retains its existing multi-statement behavior; these standalone transaction guarantees do not extend to it.

The standalone server listens on plain HTTP and is intended for a trusted network or an HTTPS reverse proxy. WebRTC requires a secure browser context outside localhost. Connections use public STUN and fall back to the server's match mailbox; TURN environment variables are not implemented. Do not expose the development server or its database as a public production service without appropriate access controls, TLS and abuse protection.

## Val Town

`main.tsx` remains the hosted entrypoint: it configures Val Town SQLite and OAuth before serving the same backend. Hosted guests can still bind their progress to a Val Town account. Deploy all current frontend, backend and shared files together; the old `updateProject.js` payload is not maintained. Standalone and hosted databases are independent.

## Rewards and match presentation

- Online and server-verified bot matches pay 40c for completing a rack and another 80c for a win. Every legal multi-pot earns 25c per extra ball, on every shot. Additional once-per-match bounties cover double (35c), triple (80c) and four-ball shots (130c), 3-ball visits (20c), 5-ball visits (45c), foul-free wins (25c), every third consecutive win (60c), and every fifth (120c). Daily contracts pay for two matches (35c), ten legal pots (50c), and a first win (40c). Bounties stack; daily contracts reset at midnight UTC. Streaks span bot and online results and reset on losses. At least one shot is required; instant concessions do not qualify.
- `shared/rewards.ts` defines rewards, deterministic per-seat rack stats, highlights, and level thresholds. A visit's consecutive-ball run ends on a miss, foul, or turn change. Scratches, respots, and uncalled shots do not award pots. Practice never awards currency.
- `reward_matches` stores verified progress; `reward_awards` has unique claim keys. A SQLite insert trigger credits bonus coins and XP together, preventing duplicate payouts on repeated settlement. Database triggers prohibit negative balances; fines clamp to zero and apply only after a successful version-guarded match update.
- Each awarded coin is one lifetime XP, including login rewards, daily-rack rewards, pots, and bounties. Fees, purchases, and fines do not subtract XP; abandoned-match escrow refunds do not grant XP. Level n starts at `250 × (n−1)²` XP. New accounts start with the configured starting balance. Legacy accounts start from their current nonnegative balance on migration: historical gross earnings cannot be reconstructed from the old net-only records. All subsequent awards are counted exactly.
- The lobby contains a live bounty board and level progress. Bot and online results show both players' shots, pots, fouls, best visit, multi-pot record, and earned bragging highlights, alongside verified bonuses. Each settled shot has a persistent brief recap. Optional browser speech narration can be toggled at the table and is saved locally; no external voice service is required. Unsupported browsers still show all text recaps. Entry transitions respect `prefers-reduced-motion`.

### Verification

Requires Node 22.12 or newer:

```sh
npm test
npm run typecheck
npm run build
```

`npm test` builds the frontend and covers physics and rules, prediction, replay protection, practice games, legacy-physics golden results, migrations, reward idempotency and balance floors. HTTP integration tests start the production server on a temporary SQLite file, create real accounts, play and settle an online match and a verified solo rack, reject forged/repeated claims, inject database failures to verify rollback, and verify profiles, rewards and replays after restart. They also check that the development middleware does not expose backend or database files. Typechecking covers the browser, worker and standalone backend; Val Town's hosted OAuth and database must still be tested in its runtime.
