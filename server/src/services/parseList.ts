export interface ParsedListEntry {
  name: string;
  quantity: number;
  raw: string;
}

const SECTION_HEADER = /^(deck|decklist|commander|sideboard|maybeboard|main\s?board)\s*:?$/i;
// Matches a trailing set code + collector number, e.g. "(C21) 263" or "(MH3)"
const SET_SUFFIX = /\s*\([A-Za-z0-9]{2,6}\)\s*[\w★]*\s*$/;
// Matches a leading quantity, e.g. "1", "1x", "2 x"
const LEADING_QTY = /^(\d+)\s*x?\s+(.+)$/i;

/**
 * Parses freeform, pasted deck-list text into {name, quantity} entries.
 * Handles the common export shapes from Moxfield/Archidekt/Arena, e.g.:
 *   "1 Sol Ring"
 *   "1x Sol Ring"
 *   "Sol Ring"
 *   "1 Sol Ring (C21) 263"
 * Blank lines, "//" / "#" comments, and section headers are ignored.
 */
export function parseCardList(raw: string): ParsedListEntry[] {
  const entries: ParsedListEntry[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
    if (SECTION_HEADER.test(trimmed)) continue;

    const qtyMatch = trimmed.match(LEADING_QTY);
    let quantity = 1;
    let rest = trimmed;
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10) || 1;
      rest = qtyMatch[2];
    }

    rest = rest.replace(SET_SUFFIX, '').trim();
    if (!rest) continue;

    entries.push({ name: rest, quantity, raw: trimmed });
  }

  return entries;
}
