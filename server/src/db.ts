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

function columnExists(table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((c) => c.name === column);
}

// True once `npm run import-scryfall` has been run at least once.
// Routes check this so they can return a helpful message instead of a
// confusing SQL error when the database is still empty.
export const isSeeded = tableExists('cards');

const exactNameStmt = db.prepare('SELECT * FROM cards WHERE name_lower = ? LIMIT 1');

// card_face_names is a newer table than `cards`; a database seeded before it
// existed would still pass isSeeded. Guard its existence rather than let a
// stale local DB crash the server on the first prepared statement — the
// fallback below just degrades to exact-name-only matching, same as before
// this table existed.
const faceNameStmt = tableExists('card_face_names')
  ? db.prepare(`
      SELECT cards.* FROM card_face_names
      JOIN cards ON cards.oracle_id = card_face_names.oracle_id
      WHERE card_face_names.face_name_lower = ?
      LIMIT 1
    `)
  : null;

export function findCardsByNames(names: string[]): Map<string, CardRow> {
  const map = new Map<string, CardRow>();
  for (const name of names) {
    const lower = name.toLowerCase();
    // Exact full name first — this is what most cards are, and it's what
    // stops a double-faced card's own back-face name from ever shadowing a
    // real single-faced card that happens to share it.
    const row = (exactNameStmt.get(lower) ?? faceNameStmt?.get(lower)) as CardRow | undefined;
    if (row) map.set(lower, row);
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

// is_background is newer than `cards` itself, same story as card_face_names
// above: guard it so a database seeded before Partner/Background support
// existed degrades to "no Backgrounds available" instead of crashing the
// server when this statement is first prepared.
const hasBackgroundColumn = columnExists('cards', 'is_background');

/** Legal, legendary Background enchantments — pairing targets for "choose a Background", never a candidate on their own. */
export function getBackgroundCards(): CardRow[] {
  if (!hasBackgroundColumn) return [];
  return db
    .prepare(
      `SELECT * FROM cards WHERE is_background = 1 AND is_legendary = 1 AND legality_commander = 'legal'`
    )
    .all() as CardRow[];
}
