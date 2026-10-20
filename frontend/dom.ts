type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> | string };

/** Element factory: on* keys bind listeners, class/style/text map directly, the rest become attributes. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "style") {
      if (typeof v === "string") el.style.cssText = v;
      else Object.assign(el.style, v);
    } else if (k === "text") el.textContent = String(v);
    else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(typeof c === "number" ? String(c) : c);
  return el;
}

export const coins = (n: number) => `${n.toLocaleString("en-US")}c`;

export function mount(root: HTMLElement, el: HTMLElement): HTMLElement {
  root.replaceChildren(el);
  return el;
}

/** One toast at a time: a new one replaces the previous instead of stacking on top of it. */
export function toast(text: string, ms = 1800): void {
  const ui = document.getElementById("ui")!;
  ui.querySelector(".toast")?.remove();
  const t = h("div", { class: "toast", text });
  ui.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Dialog over everything. Escape presses the topmost dialog's button marked `data-esc` (its cancel path). */
export function modal(...kids: Child[]): { el: HTMLElement; close: () => void } {
  const ui = document.getElementById("ui")!;
  const el = h("div", { class: "modal" }, h("div", {}, ...kids));
  ui.append(el);
  return { el, close: () => el.remove() };
}

addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const top = [...document.querySelectorAll<HTMLElement>("#ui > .modal")].pop();
  top?.querySelector<HTMLButtonElement>("button[data-esc]")?.click();
});

/** Wraps an async click handler so repeated taps while it runs are ignored. */
export function once<A extends unknown[]>(fn: (...a: A) => Promise<unknown>): (...a: A) => Promise<void> {
  let running = false;
  return async (...a: A) => {
    if (running) return;
    running = true;
    try {
      await fn(...a);
    } finally {
      running = false;
    }
  };
}

export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return hh > 0 ? `${hh}h${String(mm).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
}
