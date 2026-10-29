import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { newGame, play } from "../shared/game/engine.ts";
import { validate } from "../shared/game/validate.ts";

const root = resolve(import.meta.dirname, "..");

async function start(db: string, production = true): Promise<{ child: ChildProcess; base: string }> {
  const args = ["--import", "tsx", "--import", "./server/register.mjs", "server/main.ts"];
  if (production) args.push("--production");
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", CUEFIELD_DB: db },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((ready, reject) => {
    let output = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`server startup timed out:\n${output}`)); }, 20_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/server listening on [^\s:]+:(\d+)/);
      if (match) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        ready({ child, base: `http://127.0.0.1:${match[1]}` });
      }
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}:\n${output}`)); });
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try { await exited; } finally { clearTimeout(timer); }
  assert.equal(child.signalCode, null, "server should close its database cleanly");
  assert.equal(child.exitCode, 0);
}

type Json = Record<string, any>;
async function request(base: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Json };
}

/** Real HTTP, real game rules, and a file that survives a production-server restart. */
test("standalone accounts, authoritative match, payouts and replays persist across restart", { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "cuefield-test-"));
  const dbPath = resolve(dir, "cuefield.sqlite");
  let server: Awaited<ReturnType<typeof start>> | undefined;
  try {
    server = await start(dbPath);
    let { base } = server;
    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /<title>cuefield<\/title>/);
    assert.equal((await fetch(`${base}/data/cuefield.sqlite`)).status, 404);
    assert.equal((await fetch(`${base}/backend/db.ts`)).status, 404);
    const session = await request(base, "/session");
    assert.deepEqual(session.data, { user: null, valTownLogin: false });
    assert.equal((await request(base, "/me")).status, 401);
    assert.equal((await request(base, "/guest", undefined, { name: "x" })).status, 400);

    const alice = (await request(base, "/guest", undefined, { name: "Alice" })).data;
    const bob = (await request(base, "/guest", undefined, { name: "Bob" })).data;
    const watcher = (await request(base, "/guest", undefined, { name: "Watcher" })).data;
    assert.match(alice.token, /^[a-f0-9]{64}$/);
    assert.notEqual(alice.profile.id, bob.profile.id);
    assert.equal(alice.profile.coins, 0);
    assert.equal((await request(base, "/me", alice.token)).data.id, alice.profile.id);
    assert.equal((await request(base, "/me", "0".repeat(64))).status, 401);

    const queueA = (await request(base, "/guest", undefined, { name: "Queue A" })).data;
    const queueB = (await request(base, "/guest", undefined, { name: "Queue B" })).data;
    const entries = await Promise.all([queueA, queueB].map((p) => request(base, "/mm/join", p.token, { mode: 9, table: "garage" })));
    assert.ok(entries.every((entry) => entry.status === 200));
    const queuedMatch = entries.find((entry) => entry.data.match)?.data.match;
    assert.ok(queuedMatch);
    const waiting = entries.findIndex((entry) => !entry.data.match);
    assert.notEqual(waiting, -1);
    assert.equal((await request(base, "/mm/poll", [queueA, queueB][waiting].token, {})).data.match, queuedMatch);
    assert.equal((await request(base, `/match/${queuedMatch}/shot`, queueB.token, { shot: 0, cmd: { k: "concede" } })).status, 200);
    const rematches = await Promise.all([queueA, queueB].map((p) => request(base, `/match/${queuedMatch}/rematch`, p.token, {})));
    const next = rematches.find((reply) => reply.data.next)?.data.next;
    assert.ok(next);
    assert.equal((await request(base, `/match/${next}`, queueA.token)).data.status, "live");
    const invite = await request(base, "/challenge", queueA.token, { to: queueB.profile.id, mode: 9, table: "garage", assist: 4 });
    assert.equal(invite.status, 200);
    const accepted = await request(base, `/challenge/${invite.data.id}/accept`, queueB.token, {});
    assert.equal(accepted.status, 200);
    assert.equal((await request(base, `/match/${accepted.data.match}`, queueA.token)).data.status, "live");

    for (const p of [alice, bob]) {
      const daily = await request(base, "/me/daily", p.token, {});
      assert.equal(daily.status, 200);
      assert.equal(daily.data.amount, 100);
      assert.equal(daily.data.profile.coins, 100);
      assert.equal((await request(base, "/me/daily", p.token, {})).status, 409);
    }

    const room = await request(base, "/room/create", alice.token, { mode: 9, table: "tavern", assist: 4 });
    assert.equal(room.status, 200);
    const admissionFault = new DatabaseSync(dbPath);
    admissionFault.exec(`CREATE TRIGGER fail_test_match BEFORE INSERT ON matches BEGIN SELECT RAISE(ABORT, 'test-failure'); END`);
    admissionFault.close();
    const failedJoin = await fetch(`${base}/api/room/join`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bob.token}` },
      body: JSON.stringify({ code: room.data.code }),
    });
    assert.equal(failedJoin.status, 500);
    assert.equal((await request(base, `/room/${room.data.code}`, alice.token)).data.match, null);
    assert.equal((await request(base, "/me", alice.token)).data.coins, 100);
    assert.equal((await request(base, "/me", bob.token)).data.coins, 100);
    const fixAdmission = new DatabaseSync(dbPath);
    fixAdmission.exec("DROP TRIGGER fail_test_match");
    fixAdmission.close();
    const joined = await request(base, "/room/join", bob.token, { code: room.data.code });
    assert.equal(joined.status, 200);
    const id = joined.data.match;
    assert.equal((await request(base, `/room/${room.data.code}`, alice.token)).data.match, id);
    assert.equal((await request(base, "/me", alice.token)).data.coins, 50);
    assert.equal((await request(base, "/me", bob.token)).data.coins, 50);

    let view = (await request(base, `/match/${id}`, alice.token)).data;
    assert.equal(view.state.physics, 2);
    assert.equal(view.status, "live");
    assert.equal((await request(base, `/watch/${id}?v=0123456789abcdef`)).data.id, id);
    assert.equal((await request(base, `/match/${id}/shot`, watcher.token, { shot: 0, cmd: { k: "concede" } })).status, 403);
    const tokens = new Map([[alice.profile.id, alice.token], [bob.profile.id, bob.token]]);
    const cmd = { k: "strike", dx: -1_000_000, dy: 0, power: 100, tx: 0, ty: 0, el: 0 };
    const firstSeat = view.state.turn;
    for (let i = 0; i < 2; i++) {
      const seat = view.state.turn;
      assert.equal(seat, i === 0 ? firstSeat : 1 - firstSeat);
      const token = tokens.get(view.players[seat].id)!;
      const submitted = await request(base, `/match/${id}/shot`, token, { shot: view.state.shot, cmd });
      assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
      view = (await request(base, `/match/${id}`, token)).data;
      assert.equal(view.hash, submitted.data.hash);
      assert.equal(view.state.shot, i + 1);
      assert.equal(view.state.last.foul, "no-contact");
    }

    const winner = view.players[firstSeat], loser = view.players[1 - firstSeat];
    const winnerToken = tokens.get(winner.id)!, loserToken = tokens.get(loser.id)!;

    // Force an actual SQLite error halfway through settlement: the match and all credits must roll back.
    const beforeFaultWinner = (await request(base, "/me", winnerToken)).data;
    const beforeFaultLoser = (await request(base, "/me", loserToken)).data;
    const fault = new DatabaseSync(dbPath);
    fault.exec(`CREATE TRIGGER fail_test_award BEFORE INSERT ON reward_awards BEGIN SELECT RAISE(ABORT, 'test-failure'); END`);
    fault.close();
    const failed = await fetch(`${base}/api/match/${id}/shot`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${loserToken}` },
      body: JSON.stringify({ shot: view.state.shot, cmd: { k: "concede" } }),
    });
    assert.equal(failed.status, 500);
    assert.equal((await request(base, `/match/${id}`, winnerToken)).data.status, "live");
    assert.equal((await request(base, "/me", winnerToken)).data.coins, beforeFaultWinner.coins);
    assert.equal((await request(base, "/me", winnerToken)).data.wins, beforeFaultWinner.wins);
    assert.equal((await request(base, "/me", loserToken)).data.losses, beforeFaultLoser.losses);
    const recover = new DatabaseSync(dbPath);
    recover.exec("DROP TRIGGER fail_test_award");
    recover.close();

    const end = await request(base, `/match/${id}/shot`, loserToken, { shot: view.state.shot, cmd: { k: "concede" } });
    assert.equal(end.status, 200);
    const won = (await request(base, `/match/${id}`, winnerToken)).data;
    const lost = (await request(base, `/match/${id}`, loserToken)).data;
    assert.equal(won.status, "done");
    assert.equal(won.winner, firstSeat);
    assert.equal(won.reason, "concede");
    assert.ok(won.bonuses.some((a: Json) => a.title === "Rack completed" && a.amount === 40));
    assert.ok(won.bonuses.some((a: Json) => a.title === "Winner's purse" && a.amount === 80));
    assert.ok(lost.bonuses.some((a: Json) => a.title === "Rack completed" && a.amount === 40));
    const winnerProfile = (await request(base, "/me", winnerToken)).data;
    const loserProfile = (await request(base, "/me", loserToken)).data;
    assert.equal(winnerProfile.wins, 1);
    assert.equal(loserProfile.losses, 1);
    assert.equal(winnerProfile.coins, 45 + 100 + won.bonuses.reduce((n: number, a: Json) => n + a.amount, 0));
    assert.equal(loserProfile.coins, 45 + lost.bonuses.reduce((n: number, a: Json) => n + a.amount, 0));
    assert.equal((await request(base, `/match/${id}/shot`, loserToken, { shot: 2, cmd: { k: "concede" } })).status, 409);

    // An unfinished bot log cannot be forged into a payout.
    const solo = await request(base, "/me/solo", winnerToken, { mode: 9, table: "garage", level: 0, physics: 2 });
    assert.equal(solo.status, 200);
    assert.equal(solo.data.physics, 2);
    const unfinished = await request(base, "/me/solo/finish", winnerToken, { id: solo.data.id, log: [] });
    assert.equal(unfinished.status, 409);
    assert.equal(unfinished.data.error, "unfinished");

    // Fund a test fixture for the strict three-foul venue, then submit a real, complete solo log.
    // Every stroke is simulated here and independently re-simulated by the HTTP server.
    const fixture = new DatabaseSync(dbPath);
    fixture.prepare("UPDATE players SET coins = 6000 WHERE id = ?").run(watcher.profile.id);
    fixture.close();
    const strict = await request(base, "/me/solo", watcher.token, { mode: 9, table: "sanctum", level: 0, physics: 2 });
    assert.equal(strict.status, 200);
    assert.equal(strict.data.coins, 1000);
    let soloState = newGame(9, "sanctum", strict.data.seed, strict.data.breaker, 2);
    const cues = [strict.data.cue, strict.data.bot];
    const soloLog = [];
    for (let i = 0; i < 8 && soloState.winner < 0; i++) {
      const shot = { ...cmd, call: 0 };
      assert.equal(validate(soloState, shot, cues[soloState.turn]), null);
      soloLog.push(shot);
      soloState = play(soloState, shot, cues[soloState.turn]).state;
    }
    assert.ok(soloState.winner >= 0, "three successive fouls should finish the rack");
    const soloFault = new DatabaseSync(dbPath);
    soloFault.exec(`CREATE TRIGGER fail_test_award BEFORE INSERT ON reward_awards BEGIN SELECT RAISE(ABORT, 'test-failure'); END`);
    soloFault.close();
    const failedSolo = await fetch(`${base}/api/me/solo/finish`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${watcher.token}` },
      body: JSON.stringify({ id: strict.data.id, log: soloLog }),
    });
    assert.equal(failedSolo.status, 500);
    const soloCheck = new DatabaseSync(dbPath);
    assert.equal(soloCheck.prepare("SELECT done FROM solo WHERE id = ?").get(strict.data.id)!.done, 0);
    soloCheck.exec("DROP TRIGGER fail_test_award");
    soloCheck.close();
    const unchangedSolo = (await request(base, "/me", watcher.token)).data;
    assert.equal(unchangedSolo.coins, strict.data.coins);
    assert.equal(unchangedSolo.botWins + unchangedSolo.botLosses, 0);
    const completed = await request(base, "/me/solo/finish", watcher.token, { id: strict.data.id, log: soloLog });
    assert.equal(completed.status, 200, JSON.stringify(completed.data));
    assert.equal(completed.data.won, soloState.winner === 0);
    assert.ok(completed.data.bonuses.some((a: Json) => a.title === "Rack completed" && a.amount === 40));
    assert.equal(completed.data.profile.botWins + completed.data.profile.botLosses, 1);
    assert.equal((await request(base, "/me/solo/finish", watcher.token, { id: strict.data.id, log: soloLog })).data.error, "done");

    const replay = await request(base, `/replay/${id}`);
    assert.equal(replay.status, 200);
    assert.equal(replay.data.log.length, 3);
    assert.equal(replay.data.init.physics, 2);

    await stop(server.child);
    server = undefined;
    // Tokens are never written in plaintext to the SQLite file.
    assert.equal(readFileSync(dbPath).includes(Buffer.from(winnerToken)), false);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const tokenHash = db.prepare("SELECT token_hash FROM players WHERE id = ?").get(winner.id)!.token_hash;
    assert.equal(tokenHash, createHash("sha256").update(winnerToken).digest("hex"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reward_awards WHERE match_id = ?").get(`online:${id}`)!.n,
      won.bonuses.length + lost.bonuses.length);
    assert.equal(db.prepare("SELECT done FROM solo WHERE id = ?").get(solo.data.id)!.done, 0);
    assert.equal(db.prepare("SELECT done FROM solo WHERE id = ?").get(strict.data.id)!.done, 1);
    db.close();

    server = await start(dbPath);
    base = server.base;
    const restored = (await request(base, "/me", winnerToken)).data;
    assert.equal(restored.id, winner.id);
    assert.equal(restored.coins, winnerProfile.coins);
    assert.equal(restored.progression.xp, winnerProfile.progression.xp);
    assert.equal(restored.wins, 1);
    const restoredSolo = (await request(base, "/me", watcher.token)).data;
    assert.equal(restoredSolo.coins, completed.data.profile.coins);
    assert.equal(restoredSolo.botWins + restoredSolo.botLosses, 1);
    assert.equal((await request(base, `/replay/${id}`)).data.log.length, 3);
    assert.deepEqual((await request(base, `/match/${id}`, winnerToken)).data.bonuses, won.bonuses);
    assert.equal((await request(base, `/match/${id}/shot`, loserToken, { shot: 2, cmd: { k: "concede" } })).status, 409);
    assert.equal((await request(base, "/me", winnerToken)).data.coins, winnerProfile.coins);
  } finally {
    if (server) await stop(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("development middleware serves the frontend without exposing the database or backend files", { timeout: 30_000 }, async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "cuefield-dev-"));
  const dbPath = resolve(dir, "database.sqlite");
  let server: Awaited<ReturnType<typeof start>> | undefined;
  try {
    server = await start(dbPath, false);
    const { base } = server;
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/frontend/main.ts`)).status, 200);
    assert.equal((await fetch(`${base}/@vite/client`)).status, 200);
    assert.equal((await fetch(`${base}/backend/db.ts`)).status, 404);
    assert.equal((await fetch(`${base}/data/cuefield.sqlite`)).status, 404);
    assert.equal((await fetch(`${base}/@fs${dbPath}`)).status, 404);
    assert.equal((await fetch(`${base}/frontend/%2e%2e%2fbackend/db.ts`)).status, 404);
  } finally {
    if (server) await stop(server.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("standalone refuses ephemeral or publicly served database paths", { timeout: 15_000 }, async () => {
  await assert.rejects(start(":memory:"), /persistent file/);
  await assert.rejects(start(resolve(root, "dist", "private.sqlite")), /public dist directory/);
});
