import { createServer as createHttpServer } from "node:http";
import { existsSync } from "node:fs";
import { posix, resolve, sep } from "node:path";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import api from "../backend/api.ts";
import { configureDatabase, migrate } from "../backend/db.ts";
import { LocalSqlite } from "./sqlite.ts";
import type { ViteDevServer } from "vite";

const production = process.argv.includes("--production");
const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? "0.0.0.0";
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be an integer from 0 to 65535");
const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
if (production && !existsSync(resolve(dist, "index.html"))) throw new Error("Production assets missing; run npm run build first");

const databasePath = process.env.CUEFIELD_DB ?? resolve(root, "data/cuefield.sqlite");
if (databasePath === ":memory:") throw new Error("CUEFIELD_DB must be a persistent file, not :memory:");
const databaseFile = resolve(databasePath);
if (production && (databaseFile === dist || databaseFile.startsWith(`${dist}${sep}`))) {
  throw new Error("CUEFIELD_DB cannot be inside the public dist directory");
}
const database = new LocalSqlite(databasePath);
configureDatabase(database);
await migrate();

const app = new Hono();
app.route("/api", api);
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "server" }, 500);
});
const apiListener = getRequestListener(app.fetch);
const staticApp = new Hono();
staticApp.use("/*", serveStatic({ root: dist }));
const staticListener = getRequestListener(staticApp.fetch);
let vite: ViteDevServer | undefined;

// Vite normally exposes the project root. Only serve frontend sources and Vite internals, never the DB or server files.
function devAsset(urlPath: string): boolean {
  let path: string;
  try { path = posix.normalize(decodeURIComponent(urlPath)); } catch { return false; }
  if (!path.startsWith("/")) return false;
  const asset = path === "/" || path === "/favicon.svg" ||
    ["/frontend/", "/shared/", "/@vite/", "/@id/", "/node_modules/.vite/"].some((prefix) => path.startsWith(prefix));
  if (!asset) return false;
  const file = resolve(root, `.${path}`);
  if (file === databaseFile || file.startsWith(`${databaseFile}-`)) return false;
  return true;
}

const server = createHttpServer((req, res) => {
  const path = (req.url ?? "/").split("?", 1)[0];
  if (path === "/api" || path.startsWith("/api/")) apiListener(req, res);
  else if (production) staticListener(req, res);
  else if (!devAsset(path)) { res.writeHead(404); res.end("Not found"); }
  else if (vite) vite.middlewares(req, res);
  else { res.writeHead(503); res.end("Starting"); }
});

if (!production) {
  const { createServer } = await import("vite");
  vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: "spa" });
}

await new Promise<void>((done, reject) => {
  server.once("error", reject);
  server.listen(port, host, () => { server.off("error", reject); done(); });
});
const address = server.address();
console.log(`Cuefield ${production ? "production" : "development"} server listening on ${host}:${typeof address === "object" && address ? address.port : port}`);
console.log(`Standalone SQLite: ${databasePath} (separate from Val Town; guest accounts only)`);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await vite?.close();
  await new Promise<void>((done) => server.close(() => done()));
  database.close();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
