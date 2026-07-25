import type { CommanderSuggestionDTO } from '../types';

export interface SuggestionFilters {
  /** Identities that fit inside these colours. Empty means no colour filter. */
  colors: string[];
  /** Bracket ranges to keep, matched on `bracket.range`. Empty means all. */
  brackets: string[];
  /** Theme labels a suggestion must have *all* of. Empty means all. */
  themes: string[];
}

export const EMPTY_FILTERS: SuggestionFilters = { colors: [], brackets: [], themes: [] };

export function hasActiveFilters(filters: SuggestionFilters): boolean {
  return filters.colors.length > 0 || filters.brackets.length > 0 || filters.themes.length > 0;
}

/**
 * Colour filtering uses subset semantics: selecting {B, G} keeps commanders
 * playable in a Golgari deck — mono-black, mono-green, Golgari, and colorless
 * — rather than everything that merely touches black or green.
 *
 * That matches what you're actually asking ("what could I build in these
 * colours?"), and it's why colorless commanders always survive a colour
 * filter: an empty identity is a subset of every selection.
 */
function matchesColors(suggestion: CommanderSuggestionDTO, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const allowed = new Set(selected);
  return suggestion.colorIdentity.every((color) => allowed.has(color));
}

/** Themes are AND-ed: each one you add narrows the list further. */
function matchesThemes(suggestion: CommanderSuggestionDTO, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const present = new Set(suggestion.matchedThemes);
  return selected.every((theme) => present.has(theme));
}

function matchesBracket(suggestion: CommanderSuggestionDTO, selected: string[]): boolean {
  return selected.length === 0 || selected.includes(suggestion.bracket.range);
}

export function applyFilters(
  suggestions: CommanderSuggestionDTO[],
  filters: SuggestionFilters
): CommanderSuggestionDTO[] {
  return suggestions.filter(
    (s) =>
      matchesColors(s, filters.colors) &&
      matchesBracket(s, filters.brackets) &&
      matchesThemes(s, filters.themes)
  );
}

/**
 * The filter values worth offering, taken from the results themselves — no
 * point showing a Bracket 4–5 toggle when nothing in the list is Bracket 4–5.
 */
export function availableFilterValues(suggestions: CommanderSuggestionDTO[]) {
  const brackets = new Set<string>();
  const themes = new Set<string>();
  const colors = new Set<string>();

  for (const suggestion of suggestions) {
    brackets.add(suggestion.bracket.range);
    suggestion.matchedThemes.forEach((theme) => themes.add(theme));
    suggestion.colorIdentity.forEach((color) => colors.add(color));
  }

  return {
    brackets: [...brackets].sort(),
    themes: [...themes].sort(),
    colors,
  };
}
