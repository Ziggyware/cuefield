import { featureKey, FEATURES, ringKey, RINGS } from "../../shared/features.ts";
import { api, ApiError, type Profile, setToken } from "../api.ts";
import { coins, h, once, toast } from "../dom.ts";
import { type Def, GROUPS } from "../prefs/schema.ts";
import { gateOf, isOwned, type PrefKey, prefs, resetPrefs, setPref } from "../prefs/store.ts";

const unlock = once(async (key: string, price: number, p: Profile, refresh: (p: Profile) => void) => {
  if (p.coins < price) return toast(`needs ${coins(price)}`);
  try {
    refresh(await api<Profile>("/me/buy", { kind: "feature", id: key }));
  } catch (e) {
    toast(e instanceof ApiError ? e.code : "error");
  }
});

/** Ring colour picker: owned colours select, others show their price. */
function ringRow(p: Profile, refresh: (p: Profile) => void): HTMLElement {
  return h(
    "div",
    { class: "rings" },
    ...RINGS.map((r) => {
      const own = r.price === 0 || isOwned(ringKey(r.id));
      const sw = h("i", { style: `background:${r.hex || "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"}` });
      return h(
        "button",
        {
          class: prefs.ringColor === r.id ? "on" : "",
          onclick: () => (own ? (setPref("ringColor", r.id), refresh(p)) : unlock(ringKey(r.id), r.price, p, refresh)),
        },
        sw,
        h("span", { text: own ? r.id : coins(r.price) }),
      );
    }),
  );
}

function control(d: Def, value: HTMLElement): HTMLElement {
  const k = d.k as PrefKey, cur = prefs[k] as unknown, c = d.c;
  const put = (v: unknown) => setPref(k, v as never);
  if (c.kind === "toggle") {
    const b = h("button", { class: `switch${cur ? " on" : ""}`, text: cur ? "ON" : "OFF" });
    b.onclick = () => {
      const v = !prefs[k];
      put(v);
      b.className = `switch${v ? " on" : ""}`;
      b.textContent = v ? "ON" : "OFF";
    };
    return b;
  }
  if (c.kind === "select") {
    const s = h("select", {}, ...c.options.map(([v, l]) => h("option", { value: String(v), text: l, selected: v === cur }))) as HTMLSelectElement;
    s.onchange = () => put(typeof c.options[0][0] === "number" ? Number(s.value) : s.value);
    return s;
  }
  if (c.kind === "color") {
    const i = h("input", { type: "color", value: String(cur) }) as HTMLInputElement;
    i.oninput = () => put(i.value);
    return i;
  }
  const show = () => (value.textContent = c.fmt ? c.fmt(prefs[k] as number) : String(prefs[k]));
  const r = h("input", { type: "range", min: c.min, max: c.max, step: c.step, value: String(cur) }) as HTMLInputElement;
  r.oninput = () => {
    put(Number(r.value));
    show();
  };
  show();
  return r;
}

/** Every preference, grouped; changes apply immediately and persist on this device. Locked ones show their price. */
export function settings(p: Profile, refresh: (p: Profile) => void): HTMLElement[] {
  const out: HTMLElement[] = [
    h("span", { class: "h", text: "TARGET RING" }),
    h("span", { class: "k", style: "font-size:.8rem", text: "Colour around the balls you may hit first." }),
    ringRow(p, refresh),
  ];
  const balls = FEATURES.find((f) => f.id === "balls")!;
  if (!isOwned(featureKey("balls"))) {
    out.push(
      h("button", { text: `unlock classic + neon ball sets · ${coins(balls.price)}`, onclick: () => unlock(featureKey("balls"), balls.price, p, refresh) }),
    );
  }
  for (const g of GROUPS) {
    out.push(h("span", { class: "h", text: g.title }));
    if (g.note) out.push(h("span", { class: "k", style: "font-size:.8rem", text: g.note }));
    for (const d of g.defs) {
      const gate = gateOf(d.k as PrefKey), f = gate ? FEATURES.find((x) => x.id === gate) : null;
      if (f && !isOwned(featureKey(f.id))) {
        out.push(
          h(
            "div",
            { class: "set locked" },
            h("span", { text: d.label }),
            h("button", { text: `unlock · ${coins(f.price)}`, onclick: () => unlock(featureKey(f.id), f.price, p, refresh) }),
            h("span", { class: "note", text: d.note || f.name }),
          ),
        );
        continue;
      }
      const value = h("span", { class: "v" });
      const ctl = control(d, value);
      const range = d.c.kind === "range";
      out.push(
        h(
          "div",
          { class: "set" },
          h("span", { text: d.label }),
          range ? value : ctl,
          d.note ? h("span", { class: "note", text: d.note }) : null,
          range ? ctl : null,
        ),
      );
    }
  }
  if (p.account === "valtown") {
    out.push(h("button", {
      text: `log out ${p.name}`,
      onclick: () => {
        setToken(null);
        const f = h("form", { method: "POST", action: "/auth/logout" });
        document.body.append(f);
        f.submit();
      },
    }));
  }
  out.push(
    h("button", {
      text: "reset all settings",
      onclick: () => {
        if (!confirm("Reset every setting to its default?")) return;
        resetPrefs();
        location.reload();
      },
    }),
  );
  return out;
}
