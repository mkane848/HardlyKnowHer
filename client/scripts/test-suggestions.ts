/**
 * Tests for the "still has supporting cards" filter that keeps the card
 * display (and the filter bar's options) from showing a theme or tribe the
 * server matched globally but that ended up with zero cards once narrowed
 * to this specific commander's colour identity. Run with: npm test
 */
import assert from 'node:assert';
import {
  visibleThemeLabels,
  visibleThemeSupport,
  visibleTribeSupport,
  visibleTribeTypes,
} from '../src/lib/suggestions';
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

const withCards = { key: 'sacrifice', label: 'Sacrifice', description: '', cards: [{ name: 'Fake Card', quantity: 1, typeLine: null, isGameChanger: false }] };
const empty = { key: 'tokens', label: 'Tokens', description: '', cards: [] };

check('visibleThemeSupport drops themes with zero supporting cards', () => {
  const suggestion = makeSuggestion({ themeSupport: [withCards, empty] });
  assert.deepStrictEqual(visibleThemeSupport(suggestion), [withCards]);
});

check('visibleTribeSupport drops tribes with zero supporting cards', () => {
  const suggestion = makeSuggestion({
    tribeSupport: [
      { type: 'Goblin', cards: [] },
      { type: 'Elf', cards: [{ name: 'Fake Elf', quantity: 2, typeLine: null, isGameChanger: false }] },
    ],
  });
  assert.deepStrictEqual(visibleTribeSupport(suggestion).map((t) => t.type), ['Elf']);
});

check('visibleThemeLabels/visibleTribeTypes only name the visible groups', () => {
  const suggestion = makeSuggestion({
    themeSupport: [withCards, empty],
    tribeSupport: [{ type: 'Goblin', cards: [] }],
  });
  assert.deepStrictEqual(visibleThemeLabels(suggestion), ['Sacrifice']);
  assert.deepStrictEqual(visibleTribeTypes(suggestion), []);
});

check('a suggestion with only empty-card groups shows nothing', () => {
  const suggestion = makeSuggestion({ themeSupport: [empty], tribeSupport: [{ type: 'Goblin', cards: [] }] });
  assert.deepStrictEqual(visibleThemeSupport(suggestion), []);
  assert.deepStrictEqual(visibleTribeSupport(suggestion), []);
});

if (failures > 0) {
  console.error(`\n${failures} suggestion-visibility cases failed.`);
  process.exit(1);
}
console.log('\nAll suggestion-visibility cases passed.');
