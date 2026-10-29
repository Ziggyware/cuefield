import { Hono } from "npm:hono@4";
import { parseVal, serveFile } from "https://esm.town/v/std/utils/index.ts";
import api from "./backend/api.ts";
import { getOAuthUserData, oauthMiddleware } from "https://esm.town/v/std/oauth/middleware.ts";
import { sqlite as hostedSqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { configureDatabase } from "./backend/db.ts";
import { configureOAuthProvider } from "./backend/identity.ts";

// Keep Val Town's transport semantics; the optional standalone transaction API is not assumed here.
configureDatabase({
  execute: (statement) => hostedSqlite.execute(statement as never),
  batch: (statements) => hostedSqlite.batch(statements as never),
});
configureOAuthProvider(async (request) => {
  const session = await getOAuthUserData(request);
  return session?.user ? { id: session.user.id, username: session.user.username } : null;
});

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
