import { Router } from 'express';
import { isSeeded, findCardsByNames } from '../db';
import { parseCardList } from '../services/parseList';
import { findCombos, SpellbookError } from '../services/spellbook';

const router = Router();

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Looks up Commander Spellbook combos for one commander plus the cards from
 * the user's list that could legally go in that deck.
 *
 * Only ever reached by an explicit click on a suggestion — see the note at
 * the top of services/spellbook.ts for why that matters.
 */
router.post('/combos', async (req, res) => {
  if (!isSeeded) {
    return res.status(503).json({ error: 'The card database is empty — run "npm run prepare-data" first.' });
  }

  // See the note in recommend.ts: Express 5 leaves req.body undefined when
  // there is no parseable body, so guard before destructuring.
  const { list, commanderName } = (req.body ?? {}) as { list?: unknown; commanderName?: unknown };
  if (typeof list !== 'string' || !list.trim()) {
    return res.status(400).json({ error: 'Request body must include a non-empty "list" string.' });
  }
  if (typeof commanderName !== 'string' || !commanderName.trim()) {
    return res.status(400).json({ error: 'Request body must include a "commanderName" string.' });
  }

  const parsed = parseCardList(list);
  const nameMap = findCardsByNames([...parsed.map((p) => p.name), commanderName]);

  const commander = nameMap.get(commanderName.toLowerCase());
  if (!commander) {
    return res.status(404).json({ error: `"${commanderName}" isn't in the card database.` });
  }

  // Only cards that fit the commander's colour identity — the rest could not
  // go in the deck, so a combo involving them would be misleading.
  const identity = new Set(parseJsonArray(commander.color_identity));
  const deckCards: string[] = [];
  for (const entry of parsed) {
    const row = nameMap.get(entry.name.toLowerCase());
    if (!row || row.oracle_id === commander.oracle_id) continue;
    if (parseJsonArray(row.color_identity).every((c) => identity.has(c))) {
      deckCards.push(row.name);
    }
  }

  try {
    const lookup = await findCombos(commander.name, deckCards);
    res.json({ ...lookup, searchedCardCount: deckCards.length });
  } catch (err) {
    if (err instanceof SpellbookError) {
      return res.status(err.status === 429 ? 429 : 502).json({
        error: err.message,
        retryAfterSeconds: err.retryAfterSeconds,
      });
    }
    res.status(502).json({ error: 'Could not read the response from Commander Spellbook.' });
  }
});

export default router;
