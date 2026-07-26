import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

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
    -- Partner-family ability (rule 702.124): one of 'partner', 'partner_with',
    -- 'partner_suffix', 'friends_forever', 'choose_background',
    -- 'doctors_companion', or NULL. partner_target holds the "partner with
    -- [Name]" target name, or the "Partner—[text]" suffix, lowercased;
    -- NULL for the other variants.
    partner_ability TEXT,
    partner_target TEXT,
    -- A legendary Background enchantment (702.124m). Never itself a
    -- solo/is_commander_eligible candidate — it only becomes a commander
    -- paired with a "choose a Background" card.
    is_background INTEGER DEFAULT 0,
    image_uri TEXT
  );
  CREATE INDEX idx_cards_name_lower ON cards(name_lower);
  CREATE INDEX idx_cards_commander_eligible ON cards(is_commander_eligible);
  CREATE INDEX idx_cards_partner_ability ON cards(partner_ability);
  CREATE INDEX idx_cards_is_background ON cards(is_background);

  -- Lets a double-faced card be found by either face's name alone (e.g. a
  -- pasted decklist naming just "Fable of the Mirror-Breaker", not the full
  -- "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki"). Scoped to
  -- true DFC layouts (transform, modal_dfc) — cards that are physically two
  -- sides of one card — not split/adventure/flip cards, which share a
  -- single face and are a different case.
  DROP TABLE IF EXISTS card_face_names;
  CREATE TABLE card_face_names (
    face_name_lower TEXT NOT NULL,
    oracle_id TEXT NOT NULL
  );
  CREATE INDEX idx_face_names_lower ON card_face_names(face_name_lower);
`);

function parseCreatureTypes(typeLine: string): string[] {
  const afterDash = typeLine.split('—')[1];
  if (!afterDash) return [];
  return afterDash.trim().split(/\s+/).filter(Boolean);
}

interface PartnerInfo {
  ability: string | null;
  target: string | null;
}

/** Strips a trailing reminder-text parenthetical and punctuation, lowercases. */
function cleanTarget(raw: string): string {
  return raw
    .replace(/\(.*$/, '')
    .replace(/[.\s]+$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Detects which Partner-family ability (702.124) a card has, from its own
 * oracle text — Scryfall's structured `keywords` field flags some of these,
 * but never the target name in "Partner with [Name]" or the suffix in
 * "Partner—[text]", both of which only exist in the prose. Parsing text
 * for all six keeps one consistent source of truth instead of two.
 *
 * Checked most-specific-first: "Partner with X" and "Partner—X" both
 * contain the substring "partner", so plain Partner is only recognised
 * once every more specific variant has been ruled out.
 */
function detectPartnerAbility(oracleText: string): PartnerInfo {
  if (/doctor.s companion/i.test(oracleText)) return { ability: 'doctors_companion', target: null };
  if (/choose a background/i.test(oracleText)) return { ability: 'choose_background', target: null };
  if (/friends forever/i.test(oracleText)) return { ability: 'friends_forever', target: null };

  const partnerWith = oracleText.match(/partner with ([^(\n]+)/i);
  if (partnerWith) return { ability: 'partner_with', target: cleanTarget(partnerWith[1]) };

  const partnerSuffix = oracleText.match(/partner[—–-]\s*([^(\n]+)/i);
  if (partnerSuffix) return { ability: 'partner_suffix', target: cleanTarget(partnerSuffix[1]) };

  if (/\bpartner\b/i.test(oracleText)) return { ability: 'partner', target: null };

  return { ability: null, target: null };
}

const insert = db.prepare(`
  INSERT OR REPLACE INTO cards (
    oracle_id, name, name_lower, mana_cost, cmc, type_line, oracle_text,
    colors, color_identity, keywords, creature_types,
    power, toughness, scryfall_uri,
    legality_commander, game_changer, is_legendary, is_commander_eligible,
    partner_ability, partner_target, is_background, image_uri
  ) VALUES (
    @oracle_id, @name, @name_lower, @mana_cost, @cmc, @type_line, @oracle_text,
    @colors, @color_identity, @keywords, @creature_types,
    @power, @toughness, @scryfall_uri,
    @legality_commander, @game_changer, @is_legendary, @is_commander_eligible,
    @partner_ability, @partner_target, @is_background, @image_uri
  )
`);

const insertFaceName = db.prepare(`
  INSERT INTO card_face_names (face_name_lower, oracle_id) VALUES (?, ?)
`);

const DFC_LAYOUTS = new Set(['transform', 'modal_dfc']);

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
    // 903.3: a commander must be a creature, a Vehicle, or a Spacecraft (with
    // a power/toughness box) — not only a creature. An unanimated Vehicle's
    // type line is just "Artifact — Vehicle", no "Creature" in sight, so
    // checking isCreature alone silently excluded every legal Vehicle and
    // Spacecraft commander.
    const isEligibleType =
      typeLine.includes('Creature') || typeLine.includes('Vehicle') || typeLine.includes('Spacecraft');
    const mentionsCommander = /can be your commander/i.test(oracleText);
    const isCommanderEligible = (isLegendary === 1 && isEligibleType) || mentionsCommander ? 1 : 0;

    const { ability: partnerAbility, target: partnerTarget } = detectPartnerAbility(oracleText);
    const isBackground = typeLine.includes('Background') ? 1 : 0;

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
      partner_ability: partnerAbility,
      partner_target: partnerTarget,
      is_background: isBackground,
      image_uri: imageUri,
    });
    imported++;

    if (DFC_LAYOUTS.has(card.layout) && Array.isArray(card.card_faces)) {
      for (const face of card.card_faces as { name?: string }[]) {
        if (face.name) insertFaceName.run(face.name.toLowerCase(), card.oracle_id);
      }
    }
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
const faceNames = db.prepare('SELECT COUNT(*) as c FROM card_face_names').get() as { c: number };
console.log(`${faceNames.c} double-faced card face names indexed for single-side matching.`);
const partnerCounts = db
  .prepare(
    `SELECT partner_ability, COUNT(*) as c FROM cards WHERE partner_ability IS NOT NULL GROUP BY partner_ability`
  )
  .all() as { partner_ability: string; c: number }[];
if (partnerCounts.length > 0) {
  console.log('Partner-family abilities found:');
  for (const row of partnerCounts) console.log(`  ${row.partner_ability}: ${row.c}`);
}
const backgroundCount = db.prepare('SELECT COUNT(*) as c FROM cards WHERE is_background = 1').get() as {
  c: number;
};
console.log(`${backgroundCount.c} legendary Background enchantments found.`);

db.close();
