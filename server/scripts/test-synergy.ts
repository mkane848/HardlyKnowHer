/**
 * Tests for the recommendation engine: which commanders get suggested, and
 * what's cited as the reason. Run with: npm test
 *
 * Dependency-free (node:assert + tsx), matching the other test scripts here.
 * synergy.ts takes plain CardRow[] data rather than touching the database
 * directly, so this needs no fixture DB — just hand-built rows.
 */
import assert from 'node:assert';
import type { CardRow } from '../src/types';
import { buildCollectionProfile, scoreCommanders, type OwnedCard } from '../src/services/synergy';

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

let counter = 0;
function makeCard(overrides: Partial<CardRow> = {}): CardRow {
  const name = overrides.name ?? `Test Card ${counter++}`;
  return {
    oracle_id: name,
    name,
    name_lower: name.toLowerCase(),
    mana_cost: null,
    cmc: 0,
    type_line: null,
    oracle_text: null,
    colors: '[]',
    color_identity: '[]',
    keywords: '[]',
    creature_types: '[]',
    power: null,
    toughness: null,
    scryfall_uri: null,
    legality_commander: 'legal',
    game_changer: 0,
    is_legendary: 0,
    is_commander_eligible: 0,
    image_uri: null,
    ...overrides,
  };
}

function owns(rows: CardRow[]): OwnedCard[] {
  return rows.map((row) => ({ row, quantity: 1 }));
}

check('a candidate with no owned cards fitting its colour identity is not suggested', () => {
  const redCard = makeCard({ name: 'Red Card', color_identity: '["R"]' });
  const owned = owns([redCard]);
  const monoBlue = makeCard({ name: 'Mono Blue Commander', color_identity: '["U"]' });

  const profile = buildCollectionProfile(owned);
  assert.strictEqual(scoreCommanders([monoBlue], profile, owned).length, 0);
});

check('a single matching creature type is below the minimum signal count', () => {
  const goblin = makeCard({ name: 'Lone Goblin', color_identity: '["R"]', creature_types: '["Goblin"]' });
  const owned = owns([goblin]);
  const goblinCommander = makeCard({ name: 'Goblin Commander', color_identity: '["R"]', creature_types: '["Goblin"]' });

  const profile = buildCollectionProfile(owned);
  assert.strictEqual(scoreCommanders([goblinCommander], profile, owned).length, 0);
});

check('two matching creature types meet the minimum signal count', () => {
  const goblinA = makeCard({ name: 'Goblin A', color_identity: '["R"]', creature_types: '["Goblin"]' });
  const goblinB = makeCard({ name: 'Goblin B', color_identity: '["R"]', creature_types: '["Goblin"]' });
  const owned = owns([goblinA, goblinB]);
  const goblinCommander = makeCard({ name: 'Goblin Commander', color_identity: '["R"]', creature_types: '["Goblin"]' });

  const profile = buildCollectionProfile(owned);
  const suggestions = scoreCommanders([goblinCommander], profile, owned);
  assert.strictEqual(suggestions.length, 1);
  assert.deepStrictEqual(suggestions[0].matchedCreatureTypes, ['Goblin']);
  assert.deepStrictEqual(
    suggestions[0].tribeSupport[0].cards.map((c) => c.name),
    ['Goblin A', 'Goblin B']
  );
});

check(
  "a matched tribe can still end up with zero supporting cards once narrowed to the commander's own colour identity",
  () => {
    // Two red Goblins are enough to clear the minimum signal count for
    // "Goblin" as a global theme, and a mono-blue Goblin commander (a
    // contrived combination, but the point is the code path) still counts
    // as tribally matched -- even though neither red Goblin actually fits
    // its colour identity. This is the exact server-side data shape the
    // client's "hide 0-card tags" fix filters back out before display.
    const goblinA = makeCard({ name: 'Red Goblin A', color_identity: '["R"]', creature_types: '["Goblin"]' });
    const goblinB = makeCard({ name: 'Red Goblin B', color_identity: '["R"]', creature_types: '["Goblin"]' });
    const filler = makeCard({ name: 'Blue Filler', color_identity: '["U"]' });
    const owned = owns([goblinA, goblinB, filler]);
    const commander = makeCard({
      name: 'Blue Goblin Commander',
      color_identity: '["U"]',
      creature_types: '["Goblin"]',
    });

    const profile = buildCollectionProfile(owned);
    const [suggestion] = scoreCommanders([commander], profile, owned);

    assert.ok(suggestion, 'commander should still be suggested (identity fits via Blue Filler)');
    assert.deepStrictEqual(suggestion.matchedCreatureTypes, ['Goblin']);
    assert.strictEqual(suggestion.tribeSupport.length, 1);
    assert.strictEqual(suggestion.tribeSupport[0].type, 'Goblin');
    assert.deepStrictEqual(suggestion.tribeSupport[0].cards, []);
  }
);

check("game changer cards are only cited if they fit the commander's colour identity", () => {
  const redGameChanger = makeCard({ name: 'Red GC', color_identity: '["R"]', game_changer: 1 });
  const blueGameChanger = makeCard({ name: 'Blue GC', color_identity: '["U"]', game_changer: 1 });
  const fillerA = makeCard({ name: 'Sac Fodder A', color_identity: '["U"]', oracle_text: 'Sacrifice a creature.' });
  const fillerB = makeCard({ name: 'Sac Fodder B', color_identity: '["U"]', oracle_text: 'Sacrifice a creature.' });
  const owned = owns([redGameChanger, blueGameChanger, fillerA, fillerB]);
  const monoBlue = makeCard({
    name: 'Mono Blue Sac Commander',
    color_identity: '["U"]',
    oracle_text: 'Sacrifice a creature: draw a card.',
  });

  const profile = buildCollectionProfile(owned);
  const [suggestion] = scoreCommanders([monoBlue], profile, owned);
  assert.ok(suggestion);
  assert.deepStrictEqual(
    suggestion.gameChangerCards.map((c) => c.name),
    ['Blue GC']
  );
});

check('suggestions are sorted by score, descending, driven by coverage of the owned list', () => {
  const goblinA = makeCard({ name: 'Goblin A', color_identity: '["R"]', creature_types: '["Goblin"]' });
  const goblinB = makeCard({ name: 'Goblin B', color_identity: '["R"]', creature_types: '["Goblin"]' });
  const green1 = makeCard({ name: 'Green Filler 1', color_identity: '["G"]' });
  const green2 = makeCard({ name: 'Green Filler 2', color_identity: '["G"]' });
  const green3 = makeCard({ name: 'Green Filler 3', color_identity: '["G"]' });
  const owned = owns([goblinA, goblinB, green1, green2, green3]);

  const monoRed = makeCard({ name: 'Mono Red Goblin Lord', color_identity: '["R"]', creature_types: '["Goblin"]' });
  const gruul = makeCard({
    name: 'Gruul Goblin Lord',
    color_identity: '["R","G"]',
    creature_types: '["Goblin"]',
  });

  const profile = buildCollectionProfile(owned);
  const suggestions = scoreCommanders([monoRed, gruul], profile, owned);

  assert.strictEqual(suggestions.length, 2);
  assert.strictEqual(
    suggestions[0].card.name,
    'Gruul Goblin Lord',
    'the commander covering more of the list should score, and sort, higher'
  );
  assert.ok(suggestions[0].score > suggestions[1].score);
});

if (failures > 0) {
  console.error(`\n${failures} synergy engine cases failed.`);
  process.exit(1);
}
console.log('\nAll synergy engine cases passed.');
