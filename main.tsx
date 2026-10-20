import { Hono } from "npm:hono@4";
import { parseVal, serveFile } from "https://esm.town/v/std/utils/index.ts";
import api from "./backend/api.ts";
import { oauthMiddleware } from "https://esm.town/v/std/oauth/middleware.ts";

const app = new Hono();

app.route("/api", api);

app.get("/frontend/*", (c) => serveFile(c.req.path, import.meta.url));
app.get("/shared/*", (c) => serveFile(c.req.path, import.meta.url));
app.get("/favicon.svg", () => serveFile("/favicon.svg", import.meta.url));
app.get("/source", (c) => c.redirect(parseVal().links.self.val));

app.get("/", () => serveFile("/index.html", import.meta.url));

app.onError((err) => Promise.reject(err));

/** Val Town login: the middleware adds /auth/login, /auth/callback and /auth/logout. */
export default oauthMiddleware(app.fetch);
