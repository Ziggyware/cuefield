import { DatabaseSync } from "node:sqlite";
export const db = new DatabaseSync(":memory:");
export async function q(sql: string, args: unknown[] = []): Promise<Record<string, unknown>[]> {
  return db.prepare(sql).all(...args as never[]) as Record<string, unknown>[];
}
export async function one(sql: string, args: unknown[] = []) { return (await q(sql, args))[0]; }
export const sqlite = { async batch(statements: { sql: string; args: unknown[] }[]) {
  db.exec("BEGIN");
  try { for (const s of statements) await q(s.sql, s.args); db.exec("COMMIT"); }
  catch (error) { db.exec("ROLLBACK"); throw error; }
} };
