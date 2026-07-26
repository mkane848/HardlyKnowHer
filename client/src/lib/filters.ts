import type { CommanderSuggestionDTO } from '../types';
import { visibleThemeLabels } from './suggestions';

export type ColorCategory = 'colorless' | 'multicolor' | null;

export interface SuggestionFilters {
  /** Identities that fit inside these colours. Empty means no colour filter. */
  colors: string[];
  /**
   * A further, independent restriction by identity *size* rather than
   * membership: colorless (identity is empty) or multicolor (2+ colours).
   * Kept separate from `colors` rather than folded into the same subset
   * check, since "must be a subset of {B, G}" and "must have 2+ colours"
   * are different kinds of question — combining them means both apply.
   */
  colorCategory: ColorCategory;
  /** Bracket ranges to keep, matched on `bracket.range`. Empty means all. */
  brackets: string[];
  /** Theme labels a suggestion must have *all* of. Empty means all. */
  themes: string[];
}

export const EMPTY_FILTERS: SuggestionFilters = {
  colors: [],
  colorCategory: null,
  brackets: [],
  themes: [],
};

export function hasActiveFilters(filters: SuggestionFilters): boolean {
  return (
    filters.colors.length > 0 ||
    filters.colorCategory !== null ||
    filters.brackets.length > 0 ||
    filters.themes.length > 0
  );
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

function matchesColorCategory(suggestion: CommanderSuggestionDTO, category: ColorCategory): boolean {
  if (category === 'colorless') return suggestion.colorIdentity.length === 0;
  if (category === 'multicolor') return suggestion.colorIdentity.length >= 2;
  return true;
}

/** Themes are AND-ed: each one you add narrows the list further. Matched
 * against the same "still has supporting cards after the identity filter"
 * set the card display uses, so a filter chip never claims a theme that
 * suggestion isn't actually showing as a reason. */
function matchesThemes(suggestion: CommanderSuggestionDTO, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const present = new Set(visibleThemeLabels(suggestion));
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
      matchesColorCategory(s, filters.colorCategory) &&
      matchesBracket(s, filters.brackets) &&
      matchesThemes(s, filters.themes)
  );
}

/**
 * The filter values worth offering, taken from the results themselves — no
 * point showing a Bracket 4–5 toggle when nothing in the list is Bracket 4–5.
 * Themes are drawn from the same "still has supporting cards" set the card
 * display uses, so a filter chip never offers a theme no suggestion actually
 * shows.
 */
export function availableFilterValues(suggestions: CommanderSuggestionDTO[]) {
  const brackets = new Set<string>();
  const themes = new Set<string>();
  const colors = new Set<string>();
  let hasColorless = false;
  let hasMulticolor = false;

  for (const suggestion of suggestions) {
    brackets.add(suggestion.bracket.range);
    visibleThemeLabels(suggestion).forEach((theme) => themes.add(theme));
    suggestion.colorIdentity.forEach((color) => colors.add(color));
    if (suggestion.colorIdentity.length === 0) hasColorless = true;
    if (suggestion.colorIdentity.length >= 2) hasMulticolor = true;
  }

  return {
    brackets: [...brackets].sort(),
    themes: [...themes].sort(),
    colors,
    hasColorless,
    hasMulticolor,
  };
}
