import { useQuery } from '@tanstack/react-query';
import { fetchCombos, fetchRecommendations } from './client';

/**
 * Recommendations for a submitted list.
 *
 * Modelled as a query rather than a mutation: it POSTs only because a deck
 * list is too big for a query string, and computing it changes nothing on the
 * server. Keying it on the list means both the form and the results section
 * can read the same cache entry without passing anything between them, and
 * re-submitting an unchanged list is free.
 *
 * Pass the *submitted* list, not the textarea's live contents — otherwise
 * every keystroke is a new cache key.
 */
export function useRecommendations(submittedList: string) {
  return useQuery({
    queryKey: ['recommendations', submittedList],
    queryFn: () => fetchRecommendations(submittedList),
    enabled: submittedList.trim().length > 0,
  });
}

/**
 * Commander Spellbook combos for one commander.
 *
 * `enabled` stays false until the user clicks, so nothing is requested while
 * they're just reading. Cached results are still returned when it's false,
 * which is what lets a collapsed and reopened panel show its combos again
 * without asking Spellbook a second time.
 */
export function useCombos(commanderName: string, submittedList: string, enabled: boolean) {
  return useQuery({
    queryKey: ['combos', commanderName, submittedList],
    queryFn: () => fetchCombos(submittedList, commanderName),
    enabled,
  });
}
