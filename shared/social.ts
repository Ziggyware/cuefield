/** Table-side expression bought with coins. Emote packs add six one-tap lines; "chat" opens free text. */
export interface SocialItem {
  id: string;
  name: string;
  price: number;
  /** Lines in an emote pack; empty for free chat. */
  lines: string[];
}

export const SOCIAL: SocialItem[] = [
  { id: "basic", name: "basics", price: 0, lines: ["nice shot", "gg", "unlucky", "wow", "oops", "your turn"] },
  { id: "rail", name: "rail talk", price: 150, lines: ["good leave", "that rattled", "safety battle", "on the hill", "rack 'em", "run out"] },
  { id: "needle", name: "needle", price: 400, lines: ["lucky roll", "nerves?", "clock's ticking", "is that it?", "scratch city", "ball in hand, thanks"] },
  { id: "chat", name: "free chat", price: 600, lines: [] },
];

export const CHAT_MAX = 60;

export const socialById = (id: string): SocialItem | undefined => SOCIAL.find((s) => s.id === id);

/** Emote key "pack:index" → text, only for real lines. */
export function emoteText(key: unknown): string | null {
  if (typeof key !== "string") return null;
  const [pack, i] = key.split(":");
  return socialById(pack)?.lines[Number(i)] ?? null;
}

/** Strips control characters and markup brackets; null when nothing printable remains. */
export function cleanChat(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // deno-lint-ignore no-control-regex
  const t = raw.normalize("NFKC").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, CHAT_MAX);
  return t.length ? t : null;
}

/** Spectator reactions, sent from the rail and shown to both players. */
export const CHEERS = ["applause", "what a shot", "ooooh", "pressure"];
