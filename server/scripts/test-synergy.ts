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
import {
  buildCollectionProfile,
  buildPartnerOptions,
  scoreCommanders,
  type OwnedCard,
} from '../src/services/synergy';

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
    pairing_kind: null,
    pairing_label: null,
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

// --- partner options -----------------------------------------------------

/** A mono-white Partner commander plus a list that reaches outside white. */
function partnerScenario() {
  const whiteA = makeCard({ name: 'White Sac A', color_identity: '["W"]', oracle_text: 'Sacrifice a creature.' });
  const whiteB = makeCard({ name: 'White Sac B', color_identity: '["W"]', oracle_text: 'Sacrifice a creature.' });
  const blue1 = makeCard({ name: 'Blue Card 1', color_identity: '["U"]' });
  const blue2 = makeCard({ name: 'Blue Card 2', color_identity: '["U"]' });
  const green1 = makeCard({ name: 'Green Card', color_identity: '["G"]' });
  const owned = owns([whiteA, whiteB, blue1, blue2, green1]);

  const commander = makeCard({
    name: 'White Partner Commander',
    color_identity: '["W"]',
    oracle_text: 'Sacrifice a creature: draw a card.\nPartner (You can have two commanders if both have partner.)',
    pairing_kind: 'partner',
  });

  const profile = buildCollectionProfile(owned);
  const [suggestion] = scoreCommanders([commander], profile, owned);
  return { suggestion, owned };
}

check('partner options rank by how much more of the list each pairing unlocks', () => {
  const { suggestion, owned } = partnerScenario();

  const bluePartner = makeCard({ name: 'Blue Partner', color_identity: '["U"]', pairing_kind: 'partner' });
  const greenPartner = makeCard({ name: 'Green Partner', color_identity: '["G"]', pairing_kind: 'partner' });

  const options = buildPartnerOptions(suggestion, [bluePartner, greenPartner], owned, new Map());

  assert.strictEqual(options.length, 2);
  // Blue unlocks two cards, green only one, so blue sorts first.
  assert.strictEqual(options[0].name, 'Blue Partner');
  assert.strictEqual(options[0].addedCardCount, 2);
  assert.deepStrictEqual(options[0].combinedIdentity.sort(), ['U', 'W']);
  assert.strictEqual(options[1].name, 'Green Partner');
  assert.strictEqual(options[1].addedCardCount, 1);
});

check('partner options exclude cards that cannot legally pair', () => {
  const { suggestion, owned } = partnerScenario();

  const background = makeCard({ name: 'Some Background', color_identity: '["U"]', pairing_kind: 'background' });
  const partnerWith = makeCard({
    name: 'Specific Partner',
    color_identity: '["U"]',
    pairing_kind: 'partner-with',
    pairing_label: 'Someone Else',
  });

  const options = buildPartnerOptions(suggestion, [background, partnerWith], owned, new Map());
  assert.deepStrictEqual(options, []);
});

check('a commander with no pairing mechanic gets no options', () => {
  const plain = makeCard({ name: 'Plain Commander', color_identity: '["W"]' });
  const owned = owns([
    makeCard({ name: 'W1', color_identity: '["W"]', creature_types: '["Elf"]' }),
    makeCard({ name: 'W2', color_identity: '["W"]', creature_types: '["Elf"]' }),
  ]);
  const profile = buildCollectionProfile(owned);
  const commander = makeCard({ name: 'Plain Commander', color_identity: '["W"]', creature_types: '["Elf"]' });
  const [suggestion] = scoreCommanders([commander], profile, owned);

  assert.ok(suggestion);
  assert.deepStrictEqual(buildPartnerOptions(suggestion, [plain], owned, new Map()), []);
});

check('the identity-count memo is shared across calls and reused', () => {
  const { suggestion, owned } = partnerScenario();
  const memo = new Map<string, number>();

  const blueA = makeCard({ name: 'Blue Partner A', color_identity: '["U"]', pairing_kind: 'partner' });
  const blueB = makeCard({ name: 'Blue Partner B', color_identity: '["U"]', pairing_kind: 'partner' });

  const options = buildPartnerOptions(suggestion, [blueA, blueB], owned, memo);

  // Both resolve to the same combined identity, so it is only counted once.
  assert.strictEqual(options.length, 2);
  assert.strictEqual(memo.size, 1);
  assert.strictEqual(options[0].addedCardCount, options[1].addedCardCount);
});

if (failures > 0) {
  console.error(`\n${failures} synergy engine cases failed.`);
  process.exit(1);
}
console.log('\nAll synergy engine cases passed.');
