import { api, ApiError, hasToken, type Profile, setToken, setValTownLogin, valTownLogin } from "./api.ts";
import { h, mount, once, toast } from "./dom.ts";
import { playDaily } from "./game/daily.ts";
import { playOnline } from "./game/online.ts";
import { playFree } from "./game/freeplay.ts";
import { playHotSeat } from "./game/hotseat.ts";
import { playBot } from "./game/practice.ts";
import { replayMatch } from "./game/replay.ts";
import { watchMatch } from "./game/spectate.ts";
import { pendingJoin, takeLink } from "./links.ts";
import "./prefs/look.ts";
import { setOwned } from "./prefs/store.ts";
import { join } from "./ui/matchmaking.ts";
import { shell, type ShellActions, type Tab } from "./ui/shell.ts";

const ui = document.getElementById("ui")!;
const MATCH_KEY = "cuefield.match";
let me: Profile | undefined;
let tab: Tab = "play";
/** Bumped whenever the menu is left; a profile fetch started for an older menu must not re-mount it. */
let screenGen = 0;

const remember = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(MATCH_KEY, id);
    else sessionStorage.removeItem(MATCH_KEY);
  } catch {
    /* reconnect-on-reload unavailable */
  }
};

/** Leaves the menu for a table screen. */
const leave = (run: () => unknown) => {
  screenGen++;
  ui.replaceChildren();
  Promise.resolve()
    .then(run)
    .catch((e) => {
      console.error(e);
      toast(`unavailable: ${e instanceof ApiError ? e.code : e instanceof Error ? e.message : e}`, 3000);
      home();
    });
};

const actions: ShellActions = {
  match: (id) => enterMatch(id),
  practice: (mode, table, level) => leave(() => playBot(ui, me!, mode, table, level, home)),
  solo: (mode, table, assist, setup) => leave(() => playFree(ui, me!, mode, table, assist, home, setup)),
  hotseat: (mode, table, names) => leave(() => playHotSeat(ui, me!, mode, table, names, home)),
  watch: (id) => leave(() => watchMatch(ui, id, home, actions.replay)),
  replay: (id) => leave(() => replayMatch(ui, id, home)),
  daily: () => leave(() => playDaily(ui, me!, (p) => ((me = p ?? me), home()))),
  tab: (t) => {
    tab = t;
    render(me!);
  },
  refresh: (p) => render(p),
};

function render(p: Profile): void {
  me = p;
  setOwned(p.unlocks);
  mount(ui, shell(p, tab, actions));
}

/** Main menu on the current tab; profile refreshed in the background. */
function home(): void {
  remember(null);
  const gen = ++screenGen;
  if (me) render(me);
  api<Profile>("/me").then((p) => gen === screenGen && render(p)).catch(() => {});
  const code = pendingJoin();
  if (code && me) join(code, actions);
}

function enterMatch(id: string): void {
  remember(id);
  leave(() =>
    playOnline(ui, me!, id, (next) => {
      if (next) return enterMatch(next);
      home();
    })
  );
}

/** Sign-in: Val Town login is the account; a guest stays on this device and is bound to the login later. */
function onboard(): void {
  const input = h("input", { placeholder: "guest name", maxlength: 20 });
  const guest = once(async () => {
    try {
      const r = await api<{ token: string; profile: Profile }>("/guest", { name: input.value });
      setToken(r.token);
      me = r.profile;
      home();
    } catch (error) {
      toast(error instanceof ApiError && error.code === "name" ? "2–20 characters" : "server unreachable · try again");
    }
  });
  input.addEventListener("keydown", (e) => e.key === "Enter" && guest());
  mount(
    ui,
    h(
      "div",
      { class: "screen", style: "justify-content:center;max-width:26rem" },
      h("div", { class: "big v", text: "CUEFIELD" }),
      valTownLogin ? h("span", { class: "k", text: "Sign in with your Val Town account. Your name, coins, cues and unlocks are saved to it." }) : null,
      valTownLogin ? h("button", { class: "primary", text: "LOG IN WITH VAL TOWN", onclick: () => (location.href = "/auth/login") }) : null,
      valTownLogin ? h("div", { class: "sep" }) : null,
      h("span", { class: "k", text: valTownLogin
        ? "Or try as a guest on this device; log in later to keep the progress."
        : "Guest progress is saved on this server, separately from Val Town. Your sign-in key stays in this browser; clearing its site data loses access." }),
      h("div", { class: "row" }, input, h("button", { text: "guest", onclick: guest })),
    ),
  );
}

async function boot(): Promise<void> {
  const link = takeLink();
  // Watch and replay links work without an account.
  if (link?.kind === "watch") return leave(() => watchMatch(ui, link.id, boot, (id) => leave(() => replayMatch(ui, id, boot))));
  if (link?.kind === "replay") return leave(() => replayMatch(ui, link.id, boot));
  let session: { user: string | null; valTownLogin?: boolean };
  try {
    session = await api("/session");
  } catch {
    toast("server unreachable · retrying", 2500);
    return void setTimeout(boot, 3000);
  }
  setValTownLogin(session.valTownLogin !== false);
  if (!hasToken() && !session.user) return onboard();
  try {
    me = await api<Profile>("/me");
  } catch (e) {
    // Only a rejected credential ends the guest session; a network or server error must not discard the account.
    if (e instanceof ApiError && e.status === 401) {
      if (!session.user) setToken(null);
      return onboard();
    }
    toast("server unreachable · retrying", 2500);
    return void setTimeout(boot, 3000);
  }
  let resume: string | null = null;
  try {
    resume = sessionStorage.getItem(MATCH_KEY);
  } catch {
    resume = null;
  }
  if (resume) enterMatch(resume);
  else home();
}

boot();
