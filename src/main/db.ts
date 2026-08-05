import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";

let db: Database.Database | undefined;

const migrations: string[] = [
  `CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

export function openDb(): Database.Database {
  if (db) return db;
  db = new Database(path.join(app.getPath("userData"), "deck.db"));
  db.pragma("journal_mode = WAL");
  const applied = db.pragma("user_version", { simple: true }) as number;
  for (let i = applied; i < migrations.length; i++) {
    db.exec(migrations[i]);
    db.pragma(`user_version = ${i + 1}`);
  }
  return db;
}

export function kvGet<T>(key: string): T | undefined {
  const row = openDb().prepare("SELECT value FROM kv WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export function kvSet(key: string, value: unknown): void {
  openDb()
    .prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}
