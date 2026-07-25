import type { CommanderSuggestionDTO, ThemeSupportDTO, TribeSupportDTO } from '../types';

/**
 * A theme or tribe can be "matched" against the collection as a whole, but
 * once support cards are filtered down to ones that actually fit this
 * specific commander's colour identity, none may be left — e.g. the list has
 * two Goblins, but they're red and this commander is mono-blue. That isn't a
 * real reason to suggest the commander, so it shouldn't be shown as one.
 *
 * These helpers are the single place that applies that "still has cards"
 * filter, so the card display and the filter bar (which derives its options
 * from the same data) can't drift out of sync with each other.
 */

export function visibleThemeSupport(suggestion: CommanderSuggestionDTO): ThemeSupportDTO[] {
  return suggestion.themeSupport.filter((theme) => theme.cards.length > 0);
}

export function visibleTribeSupport(suggestion: CommanderSuggestionDTO): TribeSupportDTO[] {
  return suggestion.tribeSupport.filter((tribe) => tribe.cards.length > 0);
}

export function visibleThemeLabels(suggestion: CommanderSuggestionDTO): string[] {
  return visibleThemeSupport(suggestion).map((theme) => theme.label);
}

export function visibleTribeTypes(suggestion: CommanderSuggestionDTO): string[] {
  return visibleTribeSupport(suggestion).map((tribe) => tribe.type);
}
