// Row shape as stored in SQLite. Several fields (colors, color_identity,
// keywords, creature_types) are stored as JSON-encoded strings because
// better-sqlite3 has no native array/object column type — keeping the
// schema flat like this is the simplest thing that works for a solo project.
export interface CardRow {
  oracle_id: string;
  name: string;
  name_lower: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  oracle_text: string | null;
  colors: string; // JSON string[]
  color_identity: string; // JSON string[]
  keywords: string; // JSON string[]
  creature_types: string; // JSON string[]
  power: string | null; // string, not number — can be "*" or "1+*"
  toughness: string | null;
  scryfall_uri: string | null;
  legality_commander: string; // "legal" | "banned" | "not_legal" | "restricted"
  game_changer: number; // 0 | 1
  is_legendary: number; // 0 | 1
  is_commander_eligible: number; // 0 | 1
  image_uri: string | null;
}
