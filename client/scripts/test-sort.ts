/**
 * Tests for the "Colors, name, mana value" sort mode: fewest colours first,
 * WUBRG order within a colour count, then name, then mana value. Run with:
 * npm test
 */
import assert from 'node:assert';
import { sortSuggestions } from '../src/lib/sort';
import { makeSuggestion } from './fixtures';

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

check('relevance mode is a no-op that returns the same array reference', () => {
  const input = [makeSuggestion({ name: 'B' }), makeSuggestion({ name: 'A' })];
  const result = sortSuggestions(input, 'relevance');
  assert.strictEqual(result, input);
});

check('fewest colours sorts before more colours', () => {
  const mono = makeSuggestion({ name: 'Mono', colorIdentity: ['U'] });
  const two = makeSuggestion({ name: 'Two', colorIdentity: ['U', 'B'] });
  const three = makeSuggestion({ name: 'Three', colorIdentity: ['U', 'B', 'R'] });

  const sorted = sortSuggestions([three, mono, two], 'colorNameValue');
  assert.deepStrictEqual(sorted.map((s) => s.name), ['Mono', 'Two', 'Three']);
});

check('same colour count sorts by WUBRG order of the identity itself', () => {
  const monoGreen = makeSuggestion({ name: 'Green', colorIdentity: ['G'] });
  const monoWhite = makeSuggestion({ name: 'White', colorIdentity: ['W'] });
  const monoBlack = makeSuggestion({ name: 'Black', colorIdentity: ['B'] });

  const sorted = sortSuggestions([monoGreen, monoBlack, monoWhite], 'colorNameValue');
  assert.deepStrictEqual(sorted.map((s) => s.name), ['White', 'Black', 'Green']);
});

check('two-colour identities sort by WUBRG precedence of their first differing colour', () => {
  // Orzhov (WB) before Dimir (UB) before Rakdos (BR): W < U < B in WUBRG.
  const orzhov = makeSuggestion({ name: 'Orzhov', colorIdentity: ['W', 'B'] });
  const dimir = makeSuggestion({ name: 'Dimir', colorIdentity: ['U', 'B'] });
  const rakdos = makeSuggestion({ name: 'Rakdos', colorIdentity: ['B', 'R'] });

  const sorted = sortSuggestions([rakdos, dimir, orzhov], 'colorNameValue');
  assert.deepStrictEqual(sorted.map((s) => s.name), ['Orzhov', 'Dimir', 'Rakdos']);
});

check('same identity sorts alphabetically by name', () => {
  const zed = makeSuggestion({ name: 'Zedruu', colorIdentity: ['U'] });
  const anj = makeSuggestion({ name: 'Anje', colorIdentity: ['U'] });

  const sorted = sortSuggestions([zed, anj], 'colorNameValue');
  assert.deepStrictEqual(sorted.map((s) => s.name), ['Anje', 'Zedruu']);
});

check('mana value only breaks ties once identity and name already match', () => {
  const cheap = makeSuggestion({ name: 'Same Name', colorIdentity: ['U'], manaValue: 2 });
  const expensive = makeSuggestion({ name: 'Same Name', colorIdentity: ['U'], manaValue: 5 });

  const sorted = sortSuggestions([expensive, cheap], 'colorNameValue');
  assert.deepStrictEqual(sorted.map((s) => s.manaValue), [2, 5]);
});

check('colorNameValue mode does not mutate the input array', () => {
  const input = [makeSuggestion({ name: 'B' }), makeSuggestion({ name: 'A' })];
  const original = [...input];
  sortSuggestions(input, 'colorNameValue');
  assert.deepStrictEqual(input, original);
});

if (failures > 0) {
  console.error(`\n${failures} sort cases failed.`);
  process.exit(1);
}
console.log('\nAll sort cases passed.');
