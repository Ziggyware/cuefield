# UI Improvements (20 Ideas)

## Mobile Improvements (10)
1. **Thumb-friendly shot controls** – move the power/pull slider and cue angle wheel closer to the bottom thumb zone; increase hit targets to 44×44 px.
2. **One-handed grip mode** – shrink HUD elements to the right or left edge depending on hand preference; hide non-essential stats.
3. **Haptic stroke feedback** – map the `canVibrate` pulse intensity to the cue power pull and contact impulse (`motion.ts`).
4. **Dynamic viewport zoom** – auto-zoom to fit all moving balls in the screen (`view.fit`) when ball lifts (`z > 0.02`) and auto-reset when settled.
5. **Swipe-based replay navigation** – left/right swipe to skip strokes (`replayMatch`), tap-and-hold to pause; double-tap to restart.
6. **Pocket heat map overlay** – toggleable mobile-only view showing pocket drop/rattle statistics (`heat`) as translucent circles.
7. **Contextual pocket call UI** – tap a pocket to call it; show a glowing ring around the pocket mouth (`pocket.mouthHalf`) during call phase.
8. **Reduced motion mode** – disable camera easing (`fx/fy` transitions) and instant replay transitions for accessibility.
9. **Portrait/Landscape auto-layout** – recalculate `view.fit` insets dynamically; shift HUD to bottom in portrait, side in landscape.
10. **Offline practice sync** – cache table specs and physics constants locally; allow practice mode (`sandbox`) without network.

## PC / Desktop Improvements (10)
11. **Keyboard shortcuts** – `Space` to pause/play replay, `ArrowLeft/Right` to skip strokes, `Z/X` to cycle zoom, `C` to call pocket.
12. **Mouse-wheel zoom** – map scroll wheel directly to `session.cycleZoom` or continuous zoom scaling in `view.fit`.
13. **Hover cue guides** – show predicted path (`predictor`) and ghost ball on mouse hover without clicking.
14. **Multi-monitor support** – allow detaching the HUD or replay shield (`table-screen.ts`) into floating windows.
15. **High-DPI rendering toggle** – allow users to cap `quality.scale` for performance on 4K monitors.
16. **Replay timeline scrubber** – a visual timeline bar at the bottom of the screen to jump to specific strokes in `replayMatch`.
17. **Pocket/Rail sizing visualizer** – debug overlay showing `geometry.segments`, `pockets.mouthHalf`, and `RAIL` dimensions.
18. **Advanced stats panel** – side panel showing `shotRails`, `shotJaws`, `heat.pots`, and `heat.jaws` per pocket in real-time.
19. **Custom table spec editor** – UI to tweak `TableSpec` parameters (`L`, `W`, `corner`, `side`, `muSlide`, `muRoll`, `eCushion`) and preview physics.
20. **Instant replay speed control** – slider to adjust `REPLAY_SPEED` (0.1× to 1.0×) and duration (`REPLAY_BUFFER_SECONDS`) for `HighlightReplay`.

---

# Physical Accuracy Improvements (Table, Rails, Pockets)

1. **Pocket Geometry Scaling**
   - Update `buildGeometry` in `shared/physics/geometry.ts` to use `TableSpec.corner` and `TableSpec.side` dynamically for `mouthHalf` and `funnel` calculations.
   - Ensure `Pocket.hr` (drop radius) and `Pocket.drop` (depth) scale with `R` and `TableSpec` dimensions.
   - Add `Pocket.taper` logic that matches the physical taper of the table spec (e.g., `taper = (corner - side) / (L - W)`).

2. **Rail Placement & Sizing**
   - Fix `view.ts` `RAIL` and `CUSHION` constants to be derived from `TableSpec.rail` and `TableSpec.cloth` coefficients.
   - Update `view.fit` to use `L + 2 * CUSHION + 0.03` and `W + 2 * RAIL` based on `TableSpec` values rather than hardcoded constants.
   - Ensure `geometry.segments` use the actual `TableSpec.corner` and `TableSpec.side` mouth widths.

3. **Ball Lift & Slow-Motion Replay Logic**
   - Modify `frontend/game/highlight.ts` `HighlightReplay` to detect when `ball.z > 0.02` (ball lifts) and switch `REPLAY_SPEED` to `0.25` (1/4 speed).
   - Limit slow-motion to 5 seconds or until `ball.on === false` (pocketed) using `advance` logic.
   - Start replay at `begin` of stroke (`start = 0`) at regular speed (`REPLAY_SPEED = 1.0`) until lift.

4. **Viewport Zoom for Moving Balls**
   - Update `frontend/game/stage.ts` `frame` function to calculate bounding box of all `balls` where `b.on` and `b.z > 0` or `vx/vy > 0.01`.
   - Adjust `v.fit` zoom factor dynamically to ensure all moving balls are within `w` and `h` insets.

5. **Physical Accuracy Enhancements**
   - Refine `shared/physics/constants.ts` `E_JAW`, `MU_JAW`, `POCKET_CLEAR` based on table tier (`TableSpec.tier`).
   - Update `shared/physics/geometry.ts` `pocket` function to use `TableSpec.cloth.eCushion` for jaw restitution.
   - Ensure `shared/physics/sim.ts` (implied) uses `TableSpec.muSlide`, `muRoll`, `muSpin` from `geometry.cloth`.
   - Add `railMarks` and `jawHits` visualization scaling based on `TableSpec.rail` color and `TableSpec.cloth` color.
   - Implement `Segment` jaw facings to match `TableSpec.corner` and `TableSpec.side` angles precisely (142° and 104° adjustments).
   - Fix pocket drop hole (`hx`, `hy`) placement to align with `TableSpec.L` and `TableSpec.W` boundaries.
   - Add ball-in-hand (`bih`) placement constraints to respect `TableSpec.corner` and `TableSpec.side` mouth boundaries.
   - Sync `geometry.points` (posts) with `TableSpec` rail widths to prevent balls from clipping through.
   - Adjust `bulletFactor` in `frontend/game/motion.ts` to account for `TableSpec.eCushion` and `TableSpec.muRoll` during slow-motion.
   - Ensure `advanceReplay` and `advanceShot` use `DT` consistent with `TableSpec` physics version (`PHYSICS_VERSION`).

---

# Code Changes Plan

## 1. Replay Speed & Lift Logic (`frontend/game/highlight.ts`)
- Change `REPLAY_SPEED` constant to dynamic based on ball lift.
- Update `HighlightReplay.advance` to check `balls[ballId].z > 0.02`.

## 2. Viewport Zoom (`frontend/game/stage.ts`, `frontend/view.ts`)
- Update `v.fit` call in `stage.ts` to compute dynamic zoom based on moving balls.
- Update `view.ts` `fit` method to accept dynamic zoom and focus.

## 3. Physical Accuracy (`shared/physics/geometry.ts`, `shared/venues.ts`)
- Update `buildGeometry` to use `TableSpec` dimensions accurately for pockets and rails.
- Ensure `Pocket` and `Segment` match the physical table spec.

## 4. UI Improvements
- Implement the 20 UI ideas in `frontend/game/table-screen.ts`, `frontend/ui/hud.ts`, and `frontend/game/input.ts`.

Let's start by implementing the core physics and replay speed changes.
