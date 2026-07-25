import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { detectPairing } from '../src/services/partners';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'cards.sqlite');
const DEFAULT_INPUT = path.join(DATA_DIR, 'oracle-cards.json');

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT;

if (!fs.existsSync(inputPath)) {
  console.error(`\nCould not find a Scryfall bulk data file at:\n  ${inputPath}\n`);
  console.error('To fetch it:');
  console.error('  1. Go to https://scryfall.com/docs/api/bulk-data');
  console.error('  2. Download the "Oracle Cards" JSON file (~100-150MB)');
  console.error(`  3. Save it as: ${DEFAULT_INPUT}`);
  console.error('     (or pass a custom path: npm run import-scryfall -- /path/to/file.json)\n');
  process.exit(1);
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

console.log(`Reading ${inputPath} ...`);
const raw = fs.readFileSync(inputPath, 'utf-8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cards: any[] = JSON.parse(raw);
console.log(`Parsed ${cards.length} card entries.`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  DROP TABLE IF EXISTS cards;
  CREATE TABLE cards (
    oracle_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_lower TEXT NOT NULL,
    mana_cost TEXT,
    cmc REAL,
    type_line TEXT,
    oracle_text TEXT,
    colors TEXT,
    color_identity TEXT,
    keywords TEXT,
    creature_types TEXT,
    power TEXT,
    toughness TEXT,
    scryfall_uri TEXT,
    legality_commander TEXT,
    game_changer INTEGER DEFAULT 0,
    is_legendary INTEGER DEFAULT 0,
    is_commander_eligible INTEGER DEFAULT 0,
    image_uri TEXT,
    pairing_kind TEXT,
    pairing_label TEXT
  );
  CREATE INDEX idx_cards_name_lower ON cards(name_lower);
  CREATE INDEX idx_cards_commander_eligible ON cards(is_commander_eligible);
  CREATE INDEX idx_cards_pairing_kind ON cards(pairing_kind);
`);

function parseCreatureTypes(typeLine: string): string[] {
  const afterDash = typeLine.split('—')[1];
  if (!afterDash) return [];
  return afterDash.trim().split(/\s+/).filter(Boolean);
}

const insert = db.prepare(`
  INSERT OR REPLACE INTO cards (
    oracle_id, name, name_lower, mana_cost, cmc, type_line, oracle_text,
    colors, color_identity, keywords, creature_types,
    power, toughness, scryfall_uri,
    legality_commander, game_changer, is_legendary, is_commander_eligible, image_uri,
    pairing_kind, pairing_label
  ) VALUES (
    @oracle_id, @name, @name_lower, @mana_cost, @cmc, @type_line, @oracle_text,
    @colors, @color_identity, @keywords, @creature_types,
    @power, @toughness, @scryfall_uri,
    @legality_commander, @game_changer, @is_legendary, @is_commander_eligible, @image_uri,
    @pairing_kind, @pairing_label
  )
`);

let imported = 0;
let skipped = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const insertMany = db.transaction((rows: any[]) => {
  for (const card of rows) {
    // Skip non-gameplay objects (art cards, memorabilia) that clutter the dataset.
    if (card.layout === 'art_series' || card.set_type === 'memorabilia' || !card.oracle_id) {
      skipped++;
      continue;
    }

    const typeLine: string = card.type_line ?? card.card_faces?.[0]?.type_line ?? '';
    const oracleText: string =
      card.oracle_text ??
      (card.card_faces ?? [])
        .map((f: { oracle_text?: string }) => f.oracle_text)
        .filter(Boolean)
        .join('\n');
    const imageUri: string | null =
      card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null;

    const isLegendary = typeLine.includes('Legendary') ? 1 : 0;
    const isCreature = typeLine.includes('Creature');
    const mentionsCommander = /can be your commander/i.test(oracleText);
    const isCommanderEligible = (isLegendary === 1 && isCreature) || mentionsCommander ? 1 : 0;

    // Only legendary permanents can share a command zone, so checking the
    // pairing text on anything else would just be a way to pick up false
    // positives from cards that happen to use the same words.
    const pairing = isLegendary === 1 ? detectPairing(typeLine, oracleText) : null;

    insert.run({
      oracle_id: card.oracle_id,
      name: card.name,
      name_lower: String(card.name).toLowerCase(),
      mana_cost: card.mana_cost ?? null,
      cmc: card.cmc ?? null,
      type_line: typeLine,
      oracle_text: oracleText,
      colors: JSON.stringify(card.colors ?? card.card_faces?.[0]?.colors ?? []),
      color_identity: JSON.stringify(card.color_identity ?? []),
      keywords: JSON.stringify(card.keywords ?? []),
      creature_types: JSON.stringify(parseCreatureTypes(typeLine)),
      // Kept so the card-detail dialog can show what a printed card shows,
      // and link out to the real page rather than reimplementing it.
      power: card.power ?? card.card_faces?.[0]?.power ?? null,
      toughness: card.toughness ?? card.card_faces?.[0]?.toughness ?? null,
      scryfall_uri: card.scryfall_uri ?? null,
      legality_commander: card.legalities?.commander ?? 'not_legal',
      game_changer: card.game_changer ? 1 : 0,
      is_legendary: isLegendary,
      is_commander_eligible: isCommanderEligible,
      image_uri: imageUri,
      pairing_kind: pairing?.kind ?? null,
      pairing_label: pairing?.label ?? null,
    });
    imported++;
  }
});

insertMany(cards);

console.log(`\nImported ${imported} cards (skipped ${skipped} non-gameplay entries).`);
const eligible = db
  .prepare('SELECT COUNT(*) as c FROM cards WHERE is_commander_eligible = 1')
  .get() as { c: number };
const banned = db
  .prepare(`SELECT COUNT(*) as c FROM cards WHERE legality_commander = 'banned'`)
  .get() as { c: number };
const gameChangers = db
  .prepare('SELECT COUNT(*) as c FROM cards WHERE game_changer = 1')
  .get() as { c: number };
console.log(`${eligible.c} cards are Commander-eligible.`);
console.log(`${banned.c} cards are currently banned in Commander.`);
console.log(`${gameChangers.c} cards are on the Game Changers list.`);

const pairings = db
  .prepare(
    `SELECT pairing_kind AS kind, COUNT(*) AS c FROM cards
     WHERE pairing_kind IS NOT NULL GROUP BY pairing_kind ORDER BY c DESC`
  )
  .all() as { kind: string; c: number }[];
if (pairings.length > 0) {
  console.log(`\nCommand-zone pairing mechanics detected:`);
  for (const { kind, c } of pairings) {
    console.log(`  ${kind}: ${c}`);
  }
}

db.close();
