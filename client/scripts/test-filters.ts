/**
 * Tests for the suggestion filter bar: colour subset/category matching,
 * theme AND-ing, bracket matching, and how available filter values are
 * derived from the results themselves. Run with: npm test
 */
import assert from 'node:assert';
import { applyFilters, availableFilterValues, EMPTY_FILTERS, hasActiveFilters } from '../src/lib/filters';
import { makeSuggestion, makeSupportingCard } from './fixtures';

let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${label}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
}

check('hasActiveFilters is false only when every facet is empty', () => {
  assert.strictEqual(hasActiveFilters(EMPTY_FILTERS), false);
  assert.strictEqual(hasActiveFilters({ ...EMPTY_FILTERS, colors: ['W'] }), true);
  assert.strictEqual(hasActiveFilters({ ...EMPTY_FILTERS, colorCategory: 'colorless' }), true);
  assert.strictEqual(hasActiveFilters({ ...EMPTY_FILTERS, brackets: ['Bracket 3'] }), true);
  assert.strictEqual(hasActiveFilters({ ...EMPTY_FILTERS, themes: ['Tokens'] }), true);
});

// --- colour filtering (subset semantics) --------------------------------

check('colour filter keeps subsets of the selected colours, plus colorless', () => {
  const golgari = makeSuggestion({ colorIdentity: ['B', 'G'] });
  const monoBlack = makeSuggestion({ colorIdentity: ['B'] });
  const colorless = makeSuggestion({ colorIdentity: [] });
  const boros = makeSuggestion({ colorIdentity: ['W', 'R'] });

  const filters = { ...EMPTY_FILTERS, colors: ['B', 'G'] };
  const kept = applyFilters([golgari, monoBlack, colorless, boros], filters);
  assert.deepStrictEqual(kept, [golgari, monoBlack, colorless]);
});

check('colorCategory narrows to colorless or multicolor independently of colors', () => {
  const mono = makeSuggestion({ colorIdentity: ['B'] });
  const colorless = makeSuggestion({ colorIdentity: [] });
  const twoColor = makeSuggestion({ colorIdentity: ['B', 'G'] });

  const colorlessOnly = { ...EMPTY_FILTERS, colorCategory: 'colorless' as const };
  assert.deepStrictEqual(applyFilters([mono, colorless, twoColor], colorlessOnly), [colorless]);

  const multicolorOnly = { ...EMPTY_FILTERS, colorCategory: 'multicolor' as const };
  assert.deepStrictEqual(applyFilters([mono, colorless, twoColor], multicolorOnly), [twoColor]);
});

// --- theme filtering (AND, visible-only) --------------------------------

const sac = { key: 'sacrifice', label: 'Sacrifice', description: '', cards: [makeSupportingCard({ name: 'A' })] };
const tokens = { key: 'tokens', label: 'Tokens', description: '', cards: [makeSupportingCard({ name: 'B' })] };
const emptyTheme = { key: 'graveyard', label: 'Graveyard', description: '', cards: [] };

check('theme filter requires every selected theme to be present', () => {
  const both = makeSuggestion({ themeSupport: [sac, tokens] });
  const sacOnly = makeSuggestion({ themeSupport: [sac] });

  const filters = { ...EMPTY_FILTERS, themes: ['Sacrifice', 'Tokens'] };
  assert.deepStrictEqual(applyFilters([both, sacOnly], filters), [both]);
});

check('theme filtering only sees themes that still have supporting cards', () => {
  // "Graveyard" is matched by the server but has zero cards after identity
  // filtering — it should behave as if this suggestion doesn't have it.
  const suggestion = makeSuggestion({ themeSupport: [sac, emptyTheme] });

  const filters = { ...EMPTY_FILTERS, themes: ['Graveyard'] };
  assert.deepStrictEqual(applyFilters([suggestion], filters), []);
});

// --- bracket filtering ---------------------------------------------------

check('bracket filter matches on the bracket range', () => {
  const b1 = makeSuggestion({ bracket: { label: '', range: 'Bracket 1–2', note: '' } });
  const b3 = makeSuggestion({ bracket: { label: '', range: 'Bracket 3', note: '' } });

  const filters = { ...EMPTY_FILTERS, brackets: ['Bracket 3'] };
  assert.deepStrictEqual(applyFilters([b1, b3], filters), [b3]);
});

// --- available filter values ---------------------------------------------

check('availableFilterValues only offers themes that still have supporting cards', () => {
  const suggestion = makeSuggestion({ themeSupport: [sac, emptyTheme] });
  const { themes } = availableFilterValues([suggestion]);
  assert.deepStrictEqual(themes, ['Sacrifice']);
});

check('availableFilterValues flags colorless/multicolor presence', () => {
  const colorless = makeSuggestion({ colorIdentity: [] });
  const mono = makeSuggestion({ colorIdentity: ['B'] });
  const multi = makeSuggestion({ colorIdentity: ['B', 'G'] });

  assert.strictEqual(availableFilterValues([mono]).hasColorless, false);
  assert.strictEqual(availableFilterValues([mono]).hasMulticolor, false);
  assert.strictEqual(availableFilterValues([colorless]).hasColorless, true);
  assert.strictEqual(availableFilterValues([multi]).hasMulticolor, true);
});

if (failures > 0) {
  console.error(`\n${failures} filter cases failed.`);
  process.exit(1);
}
console.log('\nAll filter cases passed.');
