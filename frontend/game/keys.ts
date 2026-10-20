import type { Session } from "./session.ts";

/** Keyboard: ←/→ fine aim (shift ×10), hold space to charge and release to strike, Z/X zoom, R replay, Esc disarm. */
export function bindKeys(S: Session, changed: () => void): () => void {
  let charge = 0, t0 = 0, raf = 0;
  const tick = (t: number) => {
    S.controls.pull = Math.min(1, (t - t0) / 1400);
    S.controls.paint();
    changed();
    raf = requestAnimationFrame(tick);
  };
  const key = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "z" || e.key === "x") return S.cycleZoom(e.key === "z" ? 1 : -1);
    if (e.key === "r") return S.startReplay();
    if (e.key === "Escape") return S.controls.disarm();
    if (!S.canAct()) return;
    const step = (e.shiftKey ? 10 : 1) * 0.0009;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") S.aim.angle += step;
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") S.aim.angle -= step;
    else if (e.key === " " && !e.repeat && !charge) {
      charge = 1;
      t0 = performance.now();
      raf = requestAnimationFrame(tick);
    } else return;
    e.preventDefault();
    changed();
  };
  const keyUp = (e: KeyboardEvent) => {
    if (e.key !== " " || !charge) return;
    charge = 0;
    cancelAnimationFrame(raf);
    const p = S.controls.pull;
    S.controls.pull = 0;
    S.controls.paint();
    if (p > 0.015) S.shoot(p);
  };

  /** Focus lost mid-charge: the keyup never arrives, so the charge is dropped instead of firing on the next release. */
  const blur = () => {
    if (!charge) return;
    charge = 0;
    cancelAnimationFrame(raf);
    S.controls.pull = 0;
    S.controls.paint();
    changed();
  };

  addEventListener("keydown", key);
  addEventListener("keyup", keyUp);
  addEventListener("blur", blur);
  return () => {
    removeEventListener("keydown", key);
    removeEventListener("keyup", keyUp);
    removeEventListener("blur", blur);
    cancelAnimationFrame(raf);
  };
}
