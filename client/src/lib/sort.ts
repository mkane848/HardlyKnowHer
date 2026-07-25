import { COLOR_ORDER, sortWubrg } from './mtg';
import type { CommanderSuggestionDTO } from '../types';

export type SortMode = 'relevance' | 'colorNameValue';

export const SORT_MODE_LABELS: Record<SortMode, string> = {
  relevance: 'Best match',
  colorNameValue: 'Colors, name, mana value',
};

/**
 * Compares two colour identities of equal length in WUBRG order: mono-White
 * before mono-Blue, WU before WB before UB, and so on — the same priority
 * order `sortWubrg` already uses to arrange pips, applied here to arrange
 * whole identities against each other.
 */
function compareIdentity(a: string[], b: string[]): number {
  const sortedA = sortWubrg(a);
  const sortedB = sortWubrg(b);
  for (let i = 0; i < sortedA.length; i++) {
    const rankA = COLOR_ORDER.get(sortedA[i]) ?? 99;
    const rankB = COLOR_ORDER.get(sortedB[i]) ?? 99;
    if (rankA !== rankB) return rankA - rankB;
  }
  return 0;
}

/**
 * Fewest colours first, WUBRG order within a colour count, then commander
 * name, then mana value as a last-resort tiebreaker (names are unique, so it
 * rarely comes into play — it's there for the rare case Scryfall has two
 * printings sharing a name resolve to the same oracle card either way).
 */
function compareByColorNameValue(a: CommanderSuggestionDTO, b: CommanderSuggestionDTO): number {
  if (a.colorIdentity.length !== b.colorIdentity.length) {
    return a.colorIdentity.length - b.colorIdentity.length;
  }
  const identityCmp = compareIdentity(a.colorIdentity, b.colorIdentity);
  if (identityCmp !== 0) return identityCmp;

  const nameCmp = a.name.localeCompare(b.name);
  if (nameCmp !== 0) return nameCmp;

  return (a.manaValue ?? 0) - (b.manaValue ?? 0);
}

/**
 * `relevance` is a no-op: suggestions already arrive from the server ordered
 * by match score, and re-sorting a fresh array copy here would just be
 * wasted work on every render.
 */
export function sortSuggestions(
  suggestions: CommanderSuggestionDTO[],
  mode: SortMode
): CommanderSuggestionDTO[] {
  if (mode === 'relevance') return suggestions;
  return [...suggestions].sort(compareByColorNameValue);
}
