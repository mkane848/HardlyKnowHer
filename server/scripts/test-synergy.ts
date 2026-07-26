/**
 * Tests for the recommendation engine: collection profiling and commander
 * scoring. Run with: npm test
 *
 * Dependency-free (node:assert + tsx), matching the other test scripts here.
 * synergy.ts takes plain CardRow[] / CommanderUnit[] data rather than
 * touching the database directly, so this needs no fixture DB — just
 * hand-built rows.
 */
import assert from 'node:assert';
import type { CardRow } from '../src/types';
import type { CommanderUnit } from '../src/services/partners';
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
    oracle_id: overrides.oracle_id ?? name,
    name,
    name_lower: name.toLowerCase(),
    mana_cost: null,
    cmc: 0,
    type_line: 'Legendary Creature — Human',
    oracle_text: '',
    colors: '[]',
    color_identity: '[]',
    keywords: '[]',
    creature_types: '[]',
    power: '1',
    toughness: '1',
    scryfall_uri: null,
    partner_ability: null,
    partner_target: null,
    is_background: 0,
    legality_commander: 'legal',
    game_changer: 0,
    is_legendary: 1,
    is_commander_eligible: 1,
    image_uri: null,
    ...overrides,
  };
}

function owned(row: CardRow, quantity = 1): OwnedCard {
  return { row, quantity };
}

function solo(card: CardRow): CommanderUnit {
  return { cards: [card] };
}

// --- buildCollectionProfile ------------------------------------------------

check('buildCollectionProfile counts colors, weighted by quantity', () => {
  const black = makeCard({ color_identity: JSON.stringify(['B']) });
  const profile = buildCollectionProfile([owned(black, 3)]);
  assert.strictEqual(profile.colorCounts['B'], 3);
  assert.strictEqual(profile.totalCards, 3);
});

check('buildCollectionProfile counts creature types and cites the cards', () => {
  const vampire = makeCard({ name: 'Vampire A', creature_types: JSON.stringify(['Vampire']) });
  const profile = buildCollectionProfile([owned(vampire, 2)]);
  assert.strictEqual(profile.creatureTypeCounts['Vampire'], 2);
  assert.strictEqual(profile.creatureTypeCards['Vampire'].length, 1);
});

check('buildCollectionProfile counts keywords but excludes Partner-family ones', () => {
  const flyer = makeCard({ name: 'Flyer', keywords: JSON.stringify(['Flying']) });
  const partnerCard = makeCard({ name: 'Partner Card', keywords: JSON.stringify(['Partner']) });
  const profile = buildCollectionProfile([owned(flyer), owned(partnerCard)]);
  assert.strictEqual(profile.keywordCounts['Flying'], 1);
  assert.strictEqual(profile.keywordCounts['Partner'], undefined);
});

check('buildCollectionProfile detects themes from oracle text', () => {
  const sacCard = makeCard({ oracle_text: 'Sacrifice a creature: draw a card.' });
  const profile = buildCollectionProfile([owned(sacCard, 2)]);
  assert.strictEqual(profile.themeCounts['sacrifice'], 2);
});

// --- scoreCommanders: identity + signal gating -----------------------------

check('a candidate with zero colour-identity overlap is not suggested', () => {
  const ownedCard = makeCard({ color_identity: JSON.stringify(['W']) });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature.',
  });
  const profile = buildCollectionProfile([owned(ownedCard, 2)]);
  const suggestions = scoreCommanders([solo(candidate)], profile, [owned(ownedCard, 2)]);
  assert.strictEqual(suggestions.length, 0);
});

check('a candidate that fits identity but shares no signal is not suggested', () => {
  const ownedCard = makeCard({ color_identity: JSON.stringify(['B']), oracle_text: 'Draw a card.' });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Vanilla text with no matching theme.',
  });
  const profile = buildCollectionProfile([owned(ownedCard, 2)]);
  const suggestions = scoreCommanders([solo(candidate)], profile, [owned(ownedCard, 2)]);
  assert.strictEqual(suggestions.length, 0);
});

check('a signal below the minimum count threshold does not trigger a suggestion', () => {
  // Only one copy of a sacrifice card in the list — below MIN_SIGNAL_COUNT (2).
  const sacCard = makeCard({ color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const profile = buildCollectionProfile([owned(sacCard, 1)]);
  const suggestions = scoreCommanders([solo(candidate)], profile, [owned(sacCard, 1)]);
  assert.strictEqual(suggestions.length, 0);
});

check('a candidate is suggested once colour identity fits and a signal clears the threshold', () => {
  const sacCard = makeCard({ color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const profile = buildCollectionProfile([owned(sacCard, 2)]);
  const suggestions = scoreCommanders([solo(candidate)], profile, [owned(sacCard, 2)]);
  assert.strictEqual(suggestions.length, 1);
  assert.strictEqual(suggestions[0].matchedThemes.includes('Sacrifice'), true);
});

check('a matched theme still requires the candidate\'s own text to show the same signal', () => {
  // The list is sacrifice-heavy, but the candidate itself never mentions it —
  // a global match on the profile alone should not be enough.
  const sacCard = makeCard({ color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'This card does something else entirely.',
  });
  const profile = buildCollectionProfile([owned(sacCard, 2)]);
  const suggestions = scoreCommanders([solo(candidate)], profile, [owned(sacCard, 2)]);
  assert.strictEqual(suggestions.length, 0);
});

check('only cards that fit the candidate\'s colour identity count toward includedCardCount', () => {
  const fits = makeCard({ name: 'Fits', color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
  const doesNotFit = makeCard({
    name: 'Does Not Fit',
    color_identity: JSON.stringify(['W']),
    oracle_text: 'Sacrifice a creature.',
  });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const profile = buildCollectionProfile([owned(fits, 2), owned(doesNotFit, 5)]);
  const suggestions = scoreCommanders([solo(candidate)], profile, [owned(fits, 2), owned(doesNotFit, 5)]);
  assert.strictEqual(suggestions.length, 1);
  assert.strictEqual(suggestions[0].includedCardCount, 2);
});

// --- archetypes --------------------------------------------------------

check('Aristocrats requires at least 2 of its 3 component themes', () => {
  const sac = makeCard({ name: 'Sac', color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
  const dies = makeCard({
    name: 'Dies',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Whenever a creature you control dies, drain 1 life.',
  });
  const candidate = makeCard({
    name: 'Aristocrats Commander',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature. Whenever a creature you control dies, draw a card.',
  });
  const profile = buildCollectionProfile([owned(sac, 2), owned(dies, 2)]);
  const suggestions = scoreCommanders(
    [solo(candidate)],
    profile,
    [owned(sac, 2), owned(dies, 2)]
  );
  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].matchedThemes.includes('Aristocrats'));
});

check('a single matching component theme is not enough for Aristocrats', () => {
  const sac = makeCard({ name: 'Sac', color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
  const candidate = makeCard({
    name: 'Just Sacrifice',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const profile = buildCollectionProfile([owned(sac, 2)]);
  const suggestions = scoreCommanders([solo(candidate)], profile, [owned(sac, 2)]);
  assert.strictEqual(suggestions.length, 1);
  assert.strictEqual(suggestions[0].matchedThemes.includes('Aristocrats'), false);
  assert.ok(suggestions[0].matchedThemes.includes('Sacrifice'));
});

// --- sorting -------------------------------------------------------------

check('suggestions are sorted by score, highest first', () => {
  const sac = makeCard({ name: 'Sac', color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
  const weak = makeCard({
    name: 'Weak',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const strong = makeCard({
    name: 'Strong',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Vampire']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const vampire = makeCard({ name: 'Vampire', color_identity: JSON.stringify(['B']), creature_types: JSON.stringify(['Vampire']) });
  const profile = buildCollectionProfile([owned(sac, 2), owned(vampire, 2)]);
  const suggestions = scoreCommanders(
    [solo(weak), solo(strong)],
    profile,
    [owned(sac, 2), owned(vampire, 2)]
  );
  assert.strictEqual(suggestions.length, 2);
  assert.strictEqual(suggestions[0].cards[0].name, 'Strong');
  assert.ok(suggestions[0].score > suggestions[1].score);
});

// --- Partner-pair union semantics (702.124e) -------------------------------

check("a pair's colour identity is the union of both cards, not either alone", () => {
  const ownedCard = makeCard({
    name: 'Owned',
    color_identity: JSON.stringify(['U']),
    oracle_text: 'Sacrifice a creature.',
  });
  const partnerA = makeCard({ name: 'A', color_identity: JSON.stringify(['U']) });
  const partnerB = makeCard({
    name: 'B',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const profile = buildCollectionProfile([owned(ownedCard, 2)]);
  const suggestions = scoreCommanders(
    [{ cards: [partnerA, partnerB] }],
    profile,
    [owned(ownedCard, 2)]
  );
  // The owned card is mono-U; the pair's union identity (U+B) covers it even
  // though partnerB alone (mono-B) would not.
  assert.strictEqual(suggestions.length, 1);
  assert.deepStrictEqual(suggestions[0].cards.map((c) => c.name).sort(), ['A', 'B']);
});

check("a pair matches a theme that only one half's own text shows", () => {
  const sacCard = makeCard({ color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
  const silent = makeCard({ name: 'Silent Half', color_identity: JSON.stringify(['B']), oracle_text: '' });
  const vocal = makeCard({
    name: 'Vocal Half',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const profile = buildCollectionProfile([owned(sacCard, 2)]);
  const suggestions = scoreCommanders([{ cards: [silent, vocal] }], profile, [owned(sacCard, 2)]);
  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].matchedThemes.includes('Sacrifice'));
});

check("a pair matches a creature type that only one half has", () => {
  const vampireOwned = makeCard({
    name: 'Owned Vampire',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Vampire']),
  });
  const nonVampireHalf = makeCard({ name: 'Non-Vampire Half', color_identity: JSON.stringify(['B']) });
  const vampireHalf = makeCard({
    name: 'Vampire Half',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Vampire']),
  });
  const profile = buildCollectionProfile([owned(vampireOwned, 2)]);
  const suggestions = scoreCommanders(
    [{ cards: [nonVampireHalf, vampireHalf] }],
    profile,
    [owned(vampireOwned, 2)]
  );
  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].matchedCreatureTypes.includes('Vampire'));
});

if (failures > 0) {
  console.error(`\n${failures} synergy cases failed.`);
  process.exit(1);
}
console.log('\nAll synergy cases passed.');
