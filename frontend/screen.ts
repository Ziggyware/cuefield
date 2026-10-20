/**
 * Widescreen match layout. In portrait the canvases and UI layer are rotated a quarter turn by CSS so the
 * table always plays landscape; everything that reads pointer positions maps them into that virtual frame.
 */
let wide = false;

export const rotated = () => wide && innerHeight > innerWidth;

export function size(): { w: number; h: number } {
  return rotated() ? { w: innerHeight, h: innerWidth } : { w: innerWidth, h: innerHeight };
}

/** Client px → virtual landscape px. The rotated layer is `rotate(90deg)` about its top-left, placed at left: 100vw. */
export function toVirt(cx: number, cy: number): [number, number] {
  return rotated() ? [cy, innerWidth - cx] : [cx, cy];
}

/** Element box in virtual px, from layout offsets (unaffected by the CSS rotation). */
export function virtRect(el: HTMLElement): { x: number; y: number; w: number; h: number } {
  let x = 0, y = 0;
  for (let n: HTMLElement | null = el; n && n.id !== "ui"; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function sync() {
  document.body.classList.toggle("port", innerHeight > innerWidth);
  document.documentElement.style.setProperty("--vh", `${size().h / 100}px`);
}

export function setWide(on: boolean): void {
  wide = on;
  document.body.classList.toggle("wide", on);
  sync();
  if (!on) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    return;
  }
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    const req = el.requestFullscreen?.({ navigationUI: "hide" });
    req?.then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape")).catch(() => {});
  } catch {
    /* fullscreen unavailable: CSS rotation handles portrait */
  }
}

addEventListener("resize", sync);
