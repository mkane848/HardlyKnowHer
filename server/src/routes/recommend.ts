import { Router } from 'express';
import { isSeeded, findCardsByNames, getCommanderCandidates, getBackgroundCards } from '../db';
import { parseCardList } from '../services/parseList';
import { buildCollectionProfile, scoreCommanders, type OwnedCard } from '../services/synergy';
import { buildCommanderUnits, unitKey } from '../services/partners';
import { estimateBracket } from '../services/bracket';
import { applySingletonLimits } from '../services/singleton';

const router = Router();

// Deep enough that the client's colour/bracket/theme filters have something
// to narrow, while staying a single response — the client paginates it.
// Scoring already ran over every eligible commander, so a larger slice costs
// nothing but response size.
const MAX_SUGGESTIONS = 30;

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

router.post('/recommend', (req, res) => {
  if (!isSeeded) {
    return res.status(503).json({
      error:
        'The card database is empty. Download the Scryfall Oracle Cards bulk file and run "npm run import-scryfall" in /server first — see the README.',
    });
  }

  // req.body is undefined — not {} — when no body was parsed at all, e.g. a
  // POST with no Content-Type. Express 4 always left an object here; 5 does
  // not, and destructuring it directly throws a 500 instead of answering 400.
  const { list } = (req.body ?? {}) as { list?: unknown };
  if (typeof list !== 'string' || !list.trim()) {
    return res.status(400).json({ error: 'Request body must include a non-empty "list" string.' });
  }

  const parsed = parseCardList(list);
  const nameMap = findCardsByNames(parsed.map((p) => p.name));

  const submitted: OwnedCard[] = [];
  const notFound: string[] = [];

  for (const entry of parsed) {
    const row = nameMap.get(entry.name.toLowerCase());
    if (row) {
      submitted.push({ row, quantity: entry.quantity });
    } else {
      notFound.push(entry.name);
    }
  }

  // Recommend against a legal Commander deck, not the raw paste. A list
  // exported from a collection can hold several copies of a card, and
  // counting them all would let one card stand in for a whole strategy.
  const { owned, ignoredCopies } = applySingletonLimits(submitted);

  const profile = buildCollectionProfile(owned);
  const candidates = getCommanderCandidates();
  const backgrounds = getBackgroundCards();
  const units = buildCommanderUnits(candidates, backgrounds);
  const scored = scoreCommanders(units, profile, owned).slice(0, MAX_SUGGESTIONS);

  const suggestions = scored.map((s) => {
    // Every card in the unit counts toward the Bracket, alongside any Game
    // Changers in the list that fit its colour identity — a Partner pair is
    // jointly "the commander" (702.124e), so both halves' own status matters.
    const gameChangerCount = s.cards.filter((c) => c.game_changer).length + s.gameChangerCards.length;
    const colorIdentity = [...new Set(s.cards.flatMap((c) => parseJsonArray(c.color_identity)))];

    return {
      unitId: unitKey(s),
      cards: s.cards.map((c) => ({
        oracleId: c.oracle_id,
        name: c.name,
        imageUri: c.image_uri,
        colorIdentity: parseJsonArray(c.color_identity),
        typeLine: c.type_line,
        oracleText: c.oracle_text,
        manaCost: c.mana_cost,
        manaValue: c.cmc,
        power: c.power,
        toughness: c.toughness,
        scryfallUri: c.scryfall_uri,
        isGameChanger: !!c.game_changer,
      })),
      colorIdentity,
      // One decimal, not whole numbers: density-based scores are small, so
      // rounding to an integer would collapse genuinely different matches
      // onto the same value and flatten the match badge's percentages.
      score: Math.round(s.score * 10) / 10,
      matchedThemes: s.matchedThemes,
      matchedCreatureTypes: s.matchedCreatureTypes,
      matchedKeywords: s.matchedKeywords,
      includedCardCount: s.includedCardCount,
      themeSupport: s.themeSupport,
      tribeSupport: s.tribeSupport,
      keywordSupport: s.keywordSupport,
      gameChangerCards: s.gameChangerCards,
      gameChangerCount,
      bracket: estimateBracket(gameChangerCount),
    };
  });

  res.json({
    // What was submitted, versus what was actually scored. These differ by
    // the cards we could not find *and* the copies the format does not
    // allow, so `ignoredCopies` is reported alongside rather than folded in
    // — otherwise a legal-but-trimmed list would look like a failed lookup.
    totalParsed: parsed.reduce((sum, p) => sum + p.quantity, 0),
    totalMatched: owned.reduce((sum, c) => sum + c.quantity, 0),
    ignoredCopies,
    notFound,
    suggestions,
  });
});

export default router;
