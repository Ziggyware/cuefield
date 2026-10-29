import type { Report } from "./game/types.ts";

export interface RackStats {
  shots: number;
  pots: number;
  scoring: number;
  fouls: number;
  run: number;
  bestRun: number;
  multi: number;
  /** Accumulated bonus for every legal multi-ball shot; absent in legacy saved matches. */
  multiBonus?: number;
}
export const MULTIPOT_PER_EXTRA = 25;
export const multiPotBonus = (pots: number): number => MULTIPOT_PER_EXTRA * Math.max(0, Math.floor(pots) - 1);
export const emptyStats = (): RackStats => ({ shots: 0, pots: 0, scoring: 0, fouls: 0, run: 0, bestRun: 0, multi: 0, multiBonus: 0 });
export function recordShot(prev: [RackStats, RackStats] | undefined, r: Report, credited?: number[]): [RackStats, RackStats] {
  const stats: [RackStats, RackStats] = prev ? [{ ...prev[0] }, { ...prev[1] }] : [emptyStats(), emptyStats()];
  const s = stats[r.by];
  const pots = r.foul || r.uncalled ? 0 : (credited ?? r.pocketed).filter((id) => id > 0 && !r.respot.includes(id)).length;
  s.shots++;
  s.fouls += r.foul ? 1 : 0;
  s.pots += pots;
  s.scoring += pots > 0 ? 1 : 0;
  s.run = pots ? s.run + pots : 0;
  s.bestRun = Math.max(s.bestRun, s.run);
  s.multi = Math.max(s.multi, pots);
  s.multiBonus = (s.multiBonus ?? 0) + multiPotBonus(pots);
  if (!r.keep) s.run = 0;
  return stats;
}
export interface Bounty { id: string; title: string; amount: number; target: number; metric: "win" | "bestRun" | "multi" | "clean" | "streak" | "plays" | "pots"; daily?: boolean }
export const BOUNTIES: Bounty[] = [
  { id: "finish", title: "Rack completed", amount: 40, target: 1, metric: "plays" },
  { id: "victory", title: "Winner's purse", amount: 80, target: 1, metric: "win" },
  { id: "triple", title: "Triple threat · 3 balls in one visit", amount: 20, target: 3, metric: "bestRun" },
  { id: "five", title: "On fire · 5 balls in one visit", amount: 45, target: 5, metric: "bestRun" },
  { id: "double", title: "Double drop · 2 balls in one shot", amount: 35, target: 2, metric: "multi" },
  { id: "triple-drop", title: "Triple drop · 3 balls in one shot", amount: 80, target: 3, metric: "multi" },
  { id: "four-drop", title: "Four-ball drop · 4 balls in one shot", amount: 130, target: 4, metric: "multi" },
  { id: "clean", title: "Clean sweep · win without a foul", amount: 25, target: 1, metric: "clean" },
  { id: "streak3", title: "Hat trick · every 3 consecutive wins", amount: 60, target: 3, metric: "streak" },
  { id: "streak5", title: "Unstoppable · every 5 consecutive wins", amount: 120, target: 5, metric: "streak" },
  { id: "daily-play", title: "Daily warm-up · finish 2 matches", amount: 35, target: 2, metric: "plays", daily: true },
  { id: "daily-pots", title: "Daily pocket hunt · pot 10 legal balls", amount: 50, target: 10, metric: "pots", daily: true },
  { id: "daily-win", title: "Daily victory · win a match", amount: 40, target: 1, metric: "win", daily: true },
];
/** Level n starts at 250 × (n−1)² lifetime XP. */
export function progression(xp: number) {
  xp = Math.max(0, Math.floor(xp));
  const level = Math.floor(Math.sqrt(xp / 250)) + 1;
  const floor = 250 * (level - 1) ** 2, next = 250 * level ** 2;
  return { xp, level, floor, next, progress: (xp - floor) / (next - floor) };
}
export function bragging(s: RackStats, won: boolean): string[] {
  const lines: string[] = [];
  if (won) lines.push("Rack champion");
  if (s.bestRun >= 3) lines.push(`${s.bestRun}-ball run · hot hand`);
  if (s.multi >= 2) lines.push(`${s.multi}-ball drop · pocket artist`);
  if (s.shots && !s.fouls) lines.push("Spotless · zero fouls");
  if (s.pots) lines.push(`${s.pots} legal pots · ${Math.round(100 * s.scoring / s.shots)}% scoring shots`);
  return lines.length ? lines : ["Next rack, new opportunity"];
}
