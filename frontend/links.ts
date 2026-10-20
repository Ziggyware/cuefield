import { toast } from "./dom.ts";

export type Link = { kind: "watch" | "replay"; id: string } | { kind: "join"; code: string };

const JOIN_KEY = "cuefield.join";
const VIEWER_KEY = "cuefield.viewer";

const store = (k: string, v?: string | null): string | null => {
  try {
    if (v === undefined) return sessionStorage.getItem(k);
    if (v === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
  return null;
};

/** Reads ?watch=, ?replay= or ?join= once and clears it from the address bar so a reload lands in the menu. */
export function takeLink(): Link | null {
  const q = new URLSearchParams(location.search);
  const watch = q.get("watch"), replay = q.get("replay"), join = q.get("join");
  if (watch || replay || join) history.replaceState(null, "", location.pathname);
  const id = /^[0-9a-f]{8,40}$/;
  if (watch && id.test(watch)) return { kind: "watch", id: watch };
  if (replay && id.test(replay)) return { kind: "replay", id: replay };
  if (join) {
    const code = join.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code) store(JOIN_KEY, code);
  }
  return null;
}

/** A room code from a link, kept across the login redirect until the menu consumes it. */
export function pendingJoin(): string | null {
  const c = store(JOIN_KEY);
  if (c) store(JOIN_KEY, null);
  return c;
}

/** Anonymous spectator id for this tab: counts once per viewer and rate-limits cheers. */
export function viewerId(): string {
  let v = store(VIEWER_KEY);
  if (!v) {
    v = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
    store(VIEWER_KEY, v);
  }
  return v;
}

export const linkTo = (k: "watch" | "replay" | "join", v: string) => `${location.origin}/?${k}=${encodeURIComponent(v)}`;

/** Native share sheet where available, clipboard otherwise. */
export async function share(url: string, title: string): Promise<void> {
  try {
    if (navigator.share) return await navigator.share({ url, title });
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("link copied");
  } catch {
    toast(url, 6000);
  }
}
