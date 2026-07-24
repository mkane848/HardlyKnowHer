import type { CardRow } from '../types';

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
  };
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
