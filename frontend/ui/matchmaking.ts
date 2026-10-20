import type { Mode } from "../../shared/catalog.ts";
import { api, ApiError } from "../api.ts";
import { countdown, h, modal, toast } from "../dom.ts";
import { linkTo, share } from "../links.ts";
import { prefs } from "../prefs/store.ts";
import type { LobbyActions } from "./play.ts";

/** Selected mode and venue, remembered across visits. */
export const pref = {
  get mode(): Mode {
    return prefs.lastMode;
  },
  get table(): string {
    return prefs.lastVenue;
  },
};

function waitFor(label: string, check: () => Promise<string | null>, cancel: () => void, act: LobbyActions, extra?: HTMLElement) {
  const t0 = Date.now();
  const clock = h("span", { class: "v" });
  let timer = 0, open = true;
  const m = modal(
    h("span", { text: label }),
    clock,
    extra,
    h("button", {
      text: "cancel",
      "data-esc": true,
      onclick: () => {
        open = false;
        clearTimeout(timer);
        m.close();
        cancel();
      },
    }),
  );
  const loop = async () => {
    if (!open) return;
    clock.textContent = countdown(Date.now() - t0);
    try {
      const id = await check();
      if (id && open) {
        open = false;
        m.close();
        return act.match(id);
      }
    } catch {
      /* retry */
    }
    timer = setTimeout(loop, 1200);
  };
  loop();
}

export async function quick(act: LobbyActions) {
  const join = () => api<{ match: string | null }>("/mm/join", { mode: pref.mode, table: pref.table });
  try {
    const r = await join();
    if (r.match) return act.match(r.match);
  } catch (e) {
    return toast(e instanceof ApiError ? e.code : "error");
  }
  waitFor(
    "searching",
    async () => {
      const r = await api<{ match: string | null; queued: boolean }>("/mm/poll", {});
      if (r.match) return r.match;
      if (!r.queued) return (await join()).match;
      return null;
    },
    () => api("/mm/leave", {}).catch(() => {}),
    act,
  );
}

export async function room(act: LobbyActions, assist: number, corr: boolean) {
  try {
    const { code } = await api<{ code: string }>("/room/create", { mode: pref.mode, table: pref.table, assist, corr });
    const invite = h("button", { class: "primary", text: "share invite link", onclick: () => share(linkTo("join", code), `join my table · ${code}`) });
    waitFor(
      `room ${code}${corr ? " · correspondence" : ""}`,
      async () => (await api<{ match: string | null }>(`/room/${code}`)).match,
      () => api(`/room/${code}`, undefined, "DELETE").catch(() => {}),
      act,
      invite,
    );
  } catch (e) {
    toast(e instanceof ApiError ? e.code : "error");
  }
}

export async function join(code: string, act: LobbyActions) {
  try {
    act.match((await api<{ match: string }>("/room/join", { code })).match);
  } catch (e) {
    toast(e instanceof ApiError ? e.code : "error");
  }
}
