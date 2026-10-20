/** Drag helper: reports displacement along an axis from the press point, captured to the element. */
export function drag(el: HTMLElement, fn: (e: PointerEvent, phase: "down" | "move" | "up") => void) {
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    fn(e, "down");
    e.preventDefault();
  });
  el.addEventListener("pointermove", (e) => el.hasPointerCapture(e.pointerId) && fn(e, "move"));
  const end = (e: PointerEvent) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    el.releasePointerCapture(e.pointerId);
    fn(e, "up");
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
