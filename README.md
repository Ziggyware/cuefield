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
  - Aim guide built from the real simulator.
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
  - Elevation produces massé and swerve.
  - Alciatore squirt depends on the shaft's end mass.
- Ball–ball collisions: restitution plus Coulomb throw on contact slip, so both cut-induced and spin-induced throw occur.
- Cushions: impulse at nose height, with friction acting on contact-point slip.
- Collisions are found by continuous detection inside 0.5 ms steps.

## Setup

TURN (optional): set `TURN_URL` (comma-separated), `TURN_USER` and `TURN_PASS`. Without them, play uses STUN plus the relay.
