import { AsyncLocalStorage } from "node:async_hooks";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { SqliteDriver, Statement } from "../backend/db.ts";

/** File-backed SQLite transport for the same queries used by the hosted backend. */
export class LocalSqlite implements SqliteDriver {
  readonly db: DatabaseSync;
  private readonly context = new AsyncLocalStorage<boolean>();
  private tail: Promise<void> = Promise.resolve();

  constructor(filename: string) {
    const path = filename === ":memory:" ? filename : resolve(filename);
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      // Create new databases with owner-only permissions; retain an existing file's permissions.
      closeSync(openSync(path, "a", 0o600));
    }
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  }

  private run(statement: Statement): { rows: unknown[] } {
    const sql = typeof statement === "string" ? statement : statement.sql;
    const args = typeof statement === "string" ? [] : statement.args ?? [];
    return { rows: this.db.prepare(sql).all(...args as SQLInputValue[]) };
  }

  /** Serialize requests while a multi-step transaction is in flight; nested calls use the same lock. */
  private async exclusive<T>(work: () => T | Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((done) => { release = done; });
    await previous;
    try { return await work(); } finally { release(); }
  }

  async execute(statement: Statement): Promise<{ rows: unknown[] }> {
    return this.exclusive(() => this.run(statement));
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    return this.exclusive(async () => {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const result = await this.context.run(true, work);
        this.db.exec("COMMIT");
        return result;
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    });
  }

  async batch(statements: Statement[]): Promise<{ rows: unknown[] }[]> {
    return this.transaction(async () => statements.map((statement) => this.run(statement)));
  }

  close(): void {
    this.db.close();
  }
}
