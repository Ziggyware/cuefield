# Table visual refresh

## Annotated fixes

- **Player areas:** larger, taller cards in a padded HUD grid, no longer pinned to the screen corners. A blank solo seat retains its layout space without showing an empty card.
- **Chalk backgrounds:** removed the boxed dock surfaces. Scoped the lobby's `.dock` styles to `.app` so they cannot accidentally restore backgrounds or alter game input bands.
- **Spin / massé spacing:** separated the controls and their hit areas, with explicit gaps between the two instruments.
- **Stroke bands:** both visible meters fill the available side space, matching their full-band pointer input. Mirrored play still swaps the controls.
- **Pocket openings / visible table corner:** larger rendered leather openings connect to the throats, with rounded exterior corners and projecting side-pocket hoods. These are visual openings; physical jaw, collision, and drop geometry are unchanged.
- **Selection size:** target outlines follow the ball circumference rather than using the old 1.4× radius.
- **Pocket-ring occlusion:** cloth aids are clipped out of every visible ball silhouette. Pocket prediction rings are thinner and centered on the drop opening instead of the mouth.
- **Edge realism:** cushion contact shadows, bevel highlights, softer cloth falloff, directional wood grain, routed rail edges, leather depth, and a floor contact shadow.
- **Aliasing:** analytic outer-edge coverage, filtered table-cache sampling, antialiased GL context, a slightly expanded ball quad for silhouette coverage, and a minimum 1× physical rendering resolution. Fine weave fades at small scales.
- **Messages:** recap, lore, and transient table notifications share a reserved footer outside the playing surface. Toasts temporarily take the recap's place instead of stacking over it; narration stays at the right.
- **Camera correction:** fixed missing dimension exports and removed use of RGB material colors as metre measurements. Moving-ball framing now uses a dimensionless zoom ratio rather than scaling pixels-per-metre twice.

## 20 additional visual improvements

1. A quiet green-black gradient ties the HUD to the room.
2. Player names, ratings, and seat captions have distinct typography.
3. A readable “AT THE TABLE” caption supplements the active-card color.
4. Inset, rounded shot clocks animate smoothly between updates.
5. Larger inventory-ball icons have subtle spherical shading.
6. Upgrade badges have more legible sizing and rounded corners.
7. Buttons have consistent hover feedback.
8. Button presses have a subtle physical depression.
9. Keyboard focus has a clearly visible accent outline; the rules control supports Enter/Space.
10. The spin control gains a shaded spherical surface and a soft contact shadow.
11. The elevation gauge gets a quieter, rounded instrument housing.
12. The power band has calibrated major ticks rather than an empty flat strip.
13. Power fill uses a directional gradient and a soft leading edge.
14. A larger, tabular percentage remains visible at rest as well as during a pull.
15. Precision has a subtle center axis and a high-contrast reference line.
16. Precision shows a live, normalized angle readout, including 0.0° rather than a rounded 360.0°.
17. Both stroke zones have persistent gesture captions.
18. Lore text has better contrast and calmer hierarchy below the recap.
19. The pocketed-ball shelf has a cleaner divider, more legible label, and corrected slot positioning with the new padding.
20. Chat bubbles have rounded silhouettes, wrapping, and a soft shadow.

## Responsive and motion behavior

Short landscape screens use a compact header and footer, including portrait phones displayed in the game's virtual landscape orientation. This preserves substantially more table height. Reduced-motion preferences disable the new CSS transitions.

## Verification

- `npm run typecheck`: passes.
- Production build: passes.
- Four camera regression tests cover full-rail fitting on every venue, moving-ball zoom bounds, world/screen round-trips, and minimum rendering resolution.
- Browser checks cover 1568×780, 1024×768, 844×390, 390×844, 667×375, and 568×320; assert header/card separation, footer/table separation, and transparent instrument docks. Precision dragging, power readout, and a full shot simulation are exercised on desktop.
- The existing full suite has three failures, reproduced on an untouched archive of the starting commit: bank-school station `tavern 2`, the `sanctum` legacy physics hash, and highlight replay speed. No shared physics or rules code is modified by this refresh.

## Second composition pass

The follow-up is an art-direction pass rather than another layer of decorative controls:

- The reference 1568×780 viewport now fits approximately **18% more table area** than the first pass. Width-based side reservations also give laptop screens more space for the table.
- A shorter equipment/status header is separated from the utility toolbar. Zoom, replay, chat, leave, and narration now share the footer; controls have descriptive accessible labels.
- Active players use an understated edge indicator instead of a glowing outline. Locally hosted Inter names/readouts and IBM Plex Mono labels replace reliance on an external font service. Font licenses are included beside the WOFF2 assets.
- Walnut growth lines, satin mouldings, recessed inlays, cloth nap, cushion-nose occlusion, black leather, and broad softbox reflections replace the flatter materials. Default exposure/saturation are calmer; explicit saved preferences remain honored.
- The cue no longer crosses beneath stroke instruments. Prediction ribbons and secondary-ball paths are less visually dominant without removing any prediction information.
- A persistent shot index anchors the recap. The footer grows to accommodate wrapped recaps, lore, and transient notifications; the camera and input bands reserve its measured height.
- Keyboard activation of the rules and toolbar no longer also operates the cue.

The six-size browser checks were repeated, including long recaps, lore, notification wrapping, local font loading, angle/power input, and shot completion. Type checking and the production build pass. The same three baseline test failures remain; the four camera regression tests pass.
