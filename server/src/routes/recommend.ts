import { Router } from 'express';
import { isSeeded, findCardsByNames, getCommanderCandidates } from '../db';
import { parseCardList } from '../services/parseList';
import { buildCollectionProfile, scoreCommanders, type OwnedCard } from '../services/synergy';
import { estimateBracket } from '../services/bracket';

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

  const { list } = req.body as { list?: unknown };
  if (typeof list !== 'string' || !list.trim()) {
    return res.status(400).json({ error: 'Request body must include a non-empty "list" string.' });
  }

  const parsed = parseCardList(list);
  const nameMap = findCardsByNames(parsed.map((p) => p.name));

  const owned: OwnedCard[] = [];
  const notFound: string[] = [];

  for (const entry of parsed) {
    const row = nameMap.get(entry.name.toLowerCase());
    if (row) {
      owned.push({ row, quantity: entry.quantity });
    } else {
      notFound.push(entry.name);
    }
  }

  const profile = buildCollectionProfile(owned);
  const candidates = getCommanderCandidates();
  const scored = scoreCommanders(candidates, profile, owned).slice(0, MAX_SUGGESTIONS);

  const suggestions = scored.map((s) => {
    // The commander itself counts toward the Bracket alongside any Game
    // Changers in the list that fit its colour identity.
    const gameChangerCount = (s.card.game_changer ? 1 : 0) + s.gameChangerCards.length;

    return {
      oracleId: s.card.oracle_id,
      name: s.card.name,
      imageUri: s.card.image_uri,
      colorIdentity: parseJsonArray(s.card.color_identity),
      typeLine: s.card.type_line,
      oracleText: s.card.oracle_text,
      score: Math.round(s.score),
      matchedThemes: s.matchedThemes,
      matchedCreatureTypes: s.matchedCreatureTypes,
      includedCardCount: s.includedCardCount,
      themeSupport: s.themeSupport,
      tribeSupport: s.tribeSupport,
      gameChangerCards: s.gameChangerCards,
      gameChangerCount,
      isGameChanger: !!s.card.game_changer,
      bracket: estimateBracket(gameChangerCount),
    };
  });

  res.json({
    totalParsed: parsed.reduce((sum, p) => sum + p.quantity, 0),
    totalMatched: owned.reduce((sum, c) => sum + c.quantity, 0),
    notFound,
    suggestions,
  });
});

export default router;
