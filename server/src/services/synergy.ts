import type { CardRow } from '../types';

export interface OwnedCard {
  row: CardRow;
  quantity: number;
}

export interface CollectionProfile {
  colorCounts: Record<string, number>;
  creatureTypeCounts: Record<string, number>;
  themeCounts: Record<string, number>;
  totalCards: number;
}

export interface CommanderSuggestion {
  card: CardRow;
  score: number;
  matchedThemes: string[];
  matchedCreatureTypes: string[];
  includedCardCount: number;
}

// Simple oracle-text theme detection. This is deliberately a short, readable
// list rather than an exhaustive taxonomy — it's meant to be easy to extend
// by hand as you notice themes it's missing, not to be a complete model of
// Magic strategy.
const THEMES: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'sacrifice', label: 'Sacrifice', pattern: /sacrifice/i },
  { key: 'graveyard', label: 'Graveyard', pattern: /graveyard/i },
  { key: 'counters', label: '+1/+1 Counters', pattern: /\+1\/\+1 counter/i },
  { key: 'tokens', label: 'Tokens', pattern: /create[^.]*token/i },
  { key: 'artifacts', label: 'Artifacts', pattern: /artifact/i },
  { key: 'enchantments', label: 'Enchantments', pattern: /enchantment/i },
  {
    key: 'spellslinger',
    label: 'Instants & Sorceries',
    pattern: /instant or sorcery spell|whenever you cast an? (instant|sorcery)/i,
  },
  { key: 'lifegain', label: 'Lifegain', pattern: /gain(s|ed)? \d*\s*life|whenever you gain life/i },
  { key: 'draw', label: 'Card Draw', pattern: /draw (a|two|three|\d+) cards?/i },
  { key: 'mill', label: 'Mill', pattern: /mills? (a|\d)|into (their|your) graveyard from (their|your) library/i },
  { key: 'aristocrats', label: 'Death Triggers', pattern: /whenever .* (dies|died)/i },
  { key: 'landfall', label: 'Landfall', pattern: /landfall|whenever a land enters/i },
  { key: 'reanimation', label: 'Reanimation', pattern: /return .* from your graveyard to the battlefield/i },
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

export function buildCollectionProfile(owned: OwnedCard[]): CollectionProfile {
  const colorCounts: Record<string, number> = {};
  const creatureTypeCounts: Record<string, number> = {};
  const themeCounts: Record<string, number> = {};
  let totalCards = 0;

  for (const { row, quantity } of owned) {
    totalCards += quantity;

    for (const color of parseJsonArray(row.color_identity)) {
      colorCounts[color] = (colorCounts[color] ?? 0) + quantity;
    }

    for (const type of parseJsonArray(row.creature_types)) {
      creatureTypeCounts[type] = (creatureTypeCounts[type] ?? 0) + quantity;
    }

    const text = row.oracle_text ?? '';
    for (const theme of THEMES) {
      if (theme.pattern.test(text)) {
        themeCounts[theme.key] = (themeCounts[theme.key] ?? 0) + quantity;
      }
    }
  }

  return { colorCounts, creatureTypeCounts, themeCounts, totalCards };
}

const MIN_SIGNAL_COUNT = 2; // require a theme/tribe to show up at least twice to count as a real signal

/**
 * Scores each candidate commander against the collection profile.
 * A candidate needs a non-zero color-identity overlap with the uploaded
 * cards AND at least one tribal or thematic signal to be suggested —
 * this keeps the list from filling up with technically-legal but
 * meaningless matches.
 */
export function scoreCommanders(
  candidates: CardRow[],
  profile: CollectionProfile,
  owned: OwnedCard[]
): CommanderSuggestion[] {
  const suggestions: CommanderSuggestion[] = [];

  for (const candidate of candidates) {
    const identitySet = new Set(parseJsonArray(candidate.color_identity));

    let includedCardCount = 0;
    for (const { row, quantity } of owned) {
      const cardIdentity = parseJsonArray(row.color_identity);
      if (cardIdentity.every((c) => identitySet.has(c))) {
        includedCardCount += quantity;
      }
    }
    if (includedCardCount === 0) continue;

    const candidateTypes = parseJsonArray(candidate.creature_types);
    const matchedCreatureTypes = candidateTypes.filter(
      (t) => (profile.creatureTypeCounts[t] ?? 0) >= MIN_SIGNAL_COUNT
    );

    const candidateText = candidate.oracle_text ?? '';
    const matchedThemes: string[] = [];
    for (const theme of THEMES) {
      if ((profile.themeCounts[theme.key] ?? 0) >= MIN_SIGNAL_COUNT && theme.pattern.test(candidateText)) {
        matchedThemes.push(theme.label);
      }
    }

    if (matchedCreatureTypes.length === 0 && matchedThemes.length === 0) continue;

    const coverageRatio = includedCardCount / Math.max(profile.totalCards, 1);
    const score = coverageRatio * 50 + matchedCreatureTypes.length * 15 + matchedThemes.length * 10;

    suggestions.push({ card: candidate, score, matchedThemes, matchedCreatureTypes, includedCardCount });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}
