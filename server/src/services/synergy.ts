import type { CardRow } from '../types';
import { canPair, combineIdentity, type Pairing, type PairingKind } from './partners';

export interface OwnedCard {
  row: CardRow;
  quantity: number;
}

export interface CollectionProfile {
  colorCounts: Record<string, number>;
  creatureTypeCounts: Record<string, number>;
  themeCounts: Record<string, number>;
  // Which cards produced each signal, so a suggestion can show its work
  // rather than just a count.
  themeCards: Record<string, OwnedCard[]>;
  creatureTypeCards: Record<string, OwnedCard[]>;
  totalCards: number;
}

/** One of the user's cards, as cited in a suggestion's explanation. */
export interface SupportingCard {
  name: string;
  quantity: number;
  typeLine: string | null;
  isGameChanger: boolean;
  // Carried so the UI can show the card itself when one of these is tapped,
  // rather than making the name a dead end.
  imageUri: string | null;
  scryfallUri: string | null;
}

/** A theme the commander shares with the list, and the cards behind it. */
export interface ThemeSupport {
  key: string;
  label: string;
  description: string;
  cards: SupportingCard[];
}

/** A creature type the commander shares with the list. */
export interface TribeSupport {
  type: string;
  cards: SupportingCard[];
}

export interface CommanderSuggestion {
  card: CardRow;
  score: number;
  matchedThemes: string[];
  matchedCreatureTypes: string[];
  includedCardCount: number;
  themeSupport: ThemeSupport[];
  tribeSupport: TribeSupport[];
  gameChangerCards: SupportingCard[];
}

// Simple oracle-text theme detection. This is deliberately a short, readable
// list rather than an exhaustive taxonomy — it's meant to be easy to extend
// by hand as you notice themes it's missing, not to be a complete model of
// Magic strategy. `description` is user-facing: it explains what the theme
// means when a suggestion is expanded.
const THEMES: { key: string; label: string; description: string; pattern: RegExp }[] = [
  {
    key: 'sacrifice',
    label: 'Sacrifice',
    description: 'Cards that sacrifice creatures or other permanents for value.',
    pattern: /sacrifice/i,
  },
  {
    key: 'graveyard',
    label: 'Graveyard',
    description: 'Cards that treat the graveyard as a resource rather than a dead zone.',
    pattern: /graveyard/i,
  },
  {
    key: 'counters',
    label: '+1/+1 Counters',
    description: 'Cards that place +1/+1 counters or care about them.',
    pattern: /\+1\/\+1 counter/i,
  },
  {
    key: 'tokens',
    label: 'Tokens',
    description: 'Cards that create tokens, giving you bodies to attack or sacrifice with.',
    pattern: /create[^.]*token/i,
  },
  {
    key: 'artifacts',
    label: 'Artifacts',
    description: 'Artifacts and the cards that care about them.',
    pattern: /artifact/i,
  },
  {
    key: 'enchantments',
    label: 'Enchantments',
    description: 'Enchantments and the cards that care about them.',
    pattern: /enchantment/i,
  },
  {
    key: 'spellslinger',
    label: 'Instants & Sorceries',
    description: 'Payoffs for casting instants and sorceries.',
    pattern: /instant or sorcery spell|whenever you cast an? (instant|sorcery)/i,
  },
  {
    key: 'lifegain',
    label: 'Lifegain',
    description: 'Cards that gain life, or that trigger when you do.',
    pattern: /gain(s|ed)? \d*\s*life|whenever you gain life/i,
  },
  {
    key: 'draw',
    label: 'Card Draw',
    description: 'Cards that refill your hand.',
    pattern: /draw (a|two|three|\d+) cards?/i,
  },
  {
    key: 'mill',
    label: 'Mill',
    description: 'Cards that move cards from a library into a graveyard.',
    pattern: /mills? (a|\d)|into (their|your) graveyard from (their|your) library/i,
  },
  {
    key: 'aristocrats',
    label: 'Death Triggers',
    description: 'Cards that trigger when a creature dies, turning losses into value.',
    pattern: /whenever .* (dies|died)/i,
  },
  {
    key: 'landfall',
    label: 'Landfall',
    description: 'Cards that trigger when a land enters the battlefield.',
    pattern: /landfall|whenever a land enters/i,
  },
  {
    key: 'reanimation',
    label: 'Reanimation',
    description: 'Cards that return creatures from the graveyard to the battlefield.',
    pattern: /return .* from your graveyard to the battlefield/i,
  },
];

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toSupportingCard({ row, quantity }: OwnedCard): SupportingCard {
  return {
    name: row.name,
    quantity,
    typeLine: row.type_line,
    isGameChanger: !!row.game_changer,
    imageUri: row.image_uri,
    scryfallUri: row.scryfall_uri,
  };
}

/** Reads the pairing mechanic stored on a row at import time. */
export function pairingOf(row: CardRow): Pairing | null {
  if (!row.pairing_kind) return null;
  return { kind: row.pairing_kind as PairingKind, label: row.pairing_label ?? null };
}

export function buildCollectionProfile(owned: OwnedCard[]): CollectionProfile {
  const colorCounts: Record<string, number> = {};
  const creatureTypeCounts: Record<string, number> = {};
  const themeCounts: Record<string, number> = {};
  const themeCards: Record<string, OwnedCard[]> = {};
  const creatureTypeCards: Record<string, OwnedCard[]> = {};
  let totalCards = 0;

  for (const entry of owned) {
    const { row, quantity } = entry;
    totalCards += quantity;

    for (const color of parseJsonArray(row.color_identity)) {
      colorCounts[color] = (colorCounts[color] ?? 0) + quantity;
    }

    for (const type of parseJsonArray(row.creature_types)) {
      creatureTypeCounts[type] = (creatureTypeCounts[type] ?? 0) + quantity;
      (creatureTypeCards[type] ??= []).push(entry);
    }

    const text = row.oracle_text ?? '';
    for (const theme of THEMES) {
      if (theme.pattern.test(text)) {
        themeCounts[theme.key] = (themeCounts[theme.key] ?? 0) + quantity;
        (themeCards[theme.key] ??= []).push(entry);
      }
    }
  }

  return { colorCounts, creatureTypeCounts, themeCounts, themeCards, creatureTypeCards, totalCards };
}

const MIN_SIGNAL_COUNT = 2; // require a theme/tribe to show up at least twice to count as a real signal

/**
 * Scores each candidate commander against the collection profile.
 * A candidate needs a non-zero color-identity overlap with the uploaded
 * cards AND at least one tribal or thematic signal to be suggested —
 * this keeps the list from filling up with technically-legal but
 * meaningless matches.
 *
 * Alongside the score, each suggestion carries the cards behind every
 * signal it matched. Only cards that actually fit the commander's colour
 * identity are cited, since a card you couldn't legally run under that
 * commander is not a reason to pick it.
 */
export function scoreCommanders(
  candidates: CardRow[],
  profile: CollectionProfile,
  owned: OwnedCard[]
): CommanderSuggestion[] {
  const suggestions: CommanderSuggestion[] = [];

  for (const candidate of candidates) {
    const identitySet = new Set(parseJsonArray(candidate.color_identity));
    const fitsIdentity = ({ row }: OwnedCard) =>
      parseJsonArray(row.color_identity).every((c) => identitySet.has(c));

    let includedCardCount = 0;
    for (const entry of owned) {
      if (fitsIdentity(entry)) includedCardCount += entry.quantity;
    }
    if (includedCardCount === 0) continue;

    const candidateTypes = parseJsonArray(candidate.creature_types);
    const matchedCreatureTypes = candidateTypes.filter(
      (t) => (profile.creatureTypeCounts[t] ?? 0) >= MIN_SIGNAL_COUNT
    );

    const candidateText = candidate.oracle_text ?? '';
    const matchedThemeDefs = THEMES.filter(
      (theme) =>
        (profile.themeCounts[theme.key] ?? 0) >= MIN_SIGNAL_COUNT && theme.pattern.test(candidateText)
    );

    if (matchedCreatureTypes.length === 0 && matchedThemeDefs.length === 0) continue;

    const themeSupport: ThemeSupport[] = matchedThemeDefs.map((theme) => ({
      key: theme.key,
      label: theme.label,
      description: theme.description,
      cards: (profile.themeCards[theme.key] ?? []).filter(fitsIdentity).map(toSupportingCard),
    }));

    const tribeSupport: TribeSupport[] = matchedCreatureTypes.map((type) => ({
      type,
      cards: (profile.creatureTypeCards[type] ?? []).filter(fitsIdentity).map(toSupportingCard),
    }));

    const gameChangerCards = owned
      .filter((entry) => entry.row.game_changer && fitsIdentity(entry))
      .map(toSupportingCard);

    const coverageRatio = includedCardCount / Math.max(profile.totalCards, 1);
    const score = coverageRatio * 50 + matchedCreatureTypes.length * 15 + matchedThemeDefs.length * 10;

    suggestions.push({
      card: candidate,
      score,
      matchedThemes: matchedThemeDefs.map((t) => t.label),
      matchedCreatureTypes,
      includedCardCount,
      themeSupport,
      tribeSupport,
      gameChangerCards,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}

/** A legal second commander, and what pairing with it would unlock. */
export interface PartnerOption {
  oracleId: string;
  name: string;
  imageUri: string | null;
  scryfallUri: string | null;
  typeLine: string | null;
  manaCost: string | null;
  colorIdentity: string[];
  /** The pairing mechanic on the partner's side. */
  mechanic: PairingKind;
  /** Colour identity of the pair — the union of both halves. */
  combinedIdentity: string[];
  /** Cards from the list playable under the pair. */
  combinedCardCount: number;
  /** How many more than the commander alone allows. */
  addedCardCount: number;
}

/**
 * Counts the owned cards playable under a colour identity, memoised across
 * calls — most partner options resolve to one of a handful of combined
 * identities, so the same count is asked for many times over.
 */
function countOwnedFitting(owned: OwnedCard[], identity: string[], memo: Map<string, number>): number {
  const key = [...identity].sort().join('');
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const allowed = new Set(identity);
  let total = 0;
  for (const entry of owned) {
    if (parseJsonArray(entry.row.color_identity).every((c) => allowed.has(c))) {
      total += entry.quantity;
    }
  }

  memo.set(key, total);
  return total;
}

/**
 * Finds second commanders that could legally join this one, ranked by how
 * much of the user's list the pair unlocks.
 *
 * The ranking is the whole point of surfacing these: a second commander
 * widens the deck's colour identity, so the interesting question isn't
 * "who can pair with this?" but "which pairing lets me actually play more of
 * what I own?". Ties break on name so the order is stable between requests.
 */
export function buildPartnerOptions(
  suggestion: CommanderSuggestion,
  pairables: CardRow[],
  owned: OwnedCard[],
  memo: Map<string, number>,
  limit = 4
): PartnerOption[] {
  const pairing = pairingOf(suggestion.card);
  if (!pairing) return [];

  const self = { name: suggestion.card.name, pairing };
  const options: PartnerOption[] = [];

  for (const candidate of pairables) {
    const candidatePairing = pairingOf(candidate);
    if (!candidatePairing) continue;
    if (!canPair(self, { name: candidate.name, pairing: candidatePairing })) continue;

    const combinedIdentity = combineIdentity(
      parseJsonArray(suggestion.card.color_identity),
      parseJsonArray(candidate.color_identity)
    );
    const combinedCardCount = countOwnedFitting(owned, combinedIdentity, memo);

    options.push({
      oracleId: candidate.oracle_id,
      name: candidate.name,
      imageUri: candidate.image_uri,
      scryfallUri: candidate.scryfall_uri,
      typeLine: candidate.type_line,
      manaCost: candidate.mana_cost,
      colorIdentity: parseJsonArray(candidate.color_identity),
      mechanic: candidatePairing.kind,
      combinedIdentity,
      combinedCardCount,
      addedCardCount: combinedCardCount - suggestion.includedCardCount,
    });
  }

  options.sort((a, b) => b.addedCardCount - a.addedCardCount || a.name.localeCompare(b.name));
  return options.slice(0, limit);
}
