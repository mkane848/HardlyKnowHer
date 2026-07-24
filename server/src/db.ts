import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { CardRow } from './types';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'cards.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function tableExists(name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name);
  return !!row;
}

// True once `npm run import-scryfall` has been run at least once.
// Routes check this so they can return a helpful message instead of a
// confusing SQL error when the database is still empty.
export const isSeeded = tableExists('cards');

export function findCardsByNames(names: string[]): Map<string, CardRow> {
  const stmt = db.prepare('SELECT * FROM cards WHERE name_lower = ? LIMIT 1');
  const map = new Map<string, CardRow>();
  for (const name of names) {
    const row = stmt.get(name.toLowerCase()) as CardRow | undefined;
    if (row) map.set(name.toLowerCase(), row);
  }
  return map;
}

export function getCommanderCandidates(): CardRow[] {
  return db
    .prepare(
      `SELECT * FROM cards WHERE is_commander_eligible = 1 AND legality_commander = 'legal'`
    )
    .all() as CardRow[];
}
