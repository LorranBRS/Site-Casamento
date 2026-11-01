import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS weddings (
      id               INTEGER PRIMARY KEY,
      slug             TEXT NOT NULL UNIQUE,
      partner1         TEXT NOT NULL,
      partner2         TEXT NOT NULL,
      date             TEXT NOT NULL,
      time             TEXT NOT NULL DEFAULT '',
      venue            TEXT NOT NULL DEFAULT '',
      address          TEXT NOT NULL DEFAULT '',
      link_description TEXT NOT NULL DEFAULT '',
      message          TEXT NOT NULL DEFAULT '',
      cover_image      TEXT NOT NULL DEFAULT '',
      published        INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id          INTEGER PRIMARY KEY,
      wedding_id  INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER,
      image_url   TEXT NOT NULL DEFAULT '',
      link_url    TEXT NOT NULL DEFAULT '',
      reserved_by TEXT,
      reserved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS items_wedding ON items(wedding_id);

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
  `);
  return db;
}
