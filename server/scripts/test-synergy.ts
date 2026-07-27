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

/** N distinct sacrifice-themed cards — the signal threshold counts distinct
 * citable cards, not summed quantity, so "enough signal" means enough
 * different cards, not enough copies of one. */
function sacrificeCards(n: number, overrides: Partial<CardRow> = {}): CardRow[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({ name: `Sac ${i}`, oracle_text: 'Sacrifice a creature: draw a card.', ...overrides })
  );
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
  const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['W']) });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature.',
  });
  const ownedEntries = ownedCards.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
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

check('a signal below the minimum card-count threshold does not trigger a suggestion', () => {
  // Two distinct sacrifice cards — below MIN_SIGNAL_COUNT (3 distinct cards).
  const ownedCards = sacrificeCards(2, { color_identity: JSON.stringify(['B']) });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const ownedEntries = ownedCards.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
  assert.strictEqual(suggestions.length, 0);
});

check('summed quantity of one card is not enough — the threshold counts distinct cards', () => {
  // A single card owned in bulk should not, by itself, clear a threshold
  // meant to measure how many different cards support a theme.
  const sacCard = makeCard({ color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const profile = buildCollectionProfile([owned(sacCard, 10)]);
  const suggestions = scoreCommanders([solo(candidate)], profile, [owned(sacCard, 10)]);
  assert.strictEqual(suggestions.length, 0);
});

check('a candidate is suggested once colour identity fits and a signal clears the threshold', () => {
  const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const ownedEntries = ownedCards.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
  assert.strictEqual(suggestions.length, 1);
  assert.strictEqual(suggestions[0].matchedThemes.includes('Sacrifice'), true);
  assert.strictEqual(suggestions[0].themeSupport[0].cards.length, 3);
});

check('a weak signal is stripped from a suggestion that survives on a strong one', () => {
  // The case that motivated the threshold: a commander that is both a Human
  // and a Wizard, against a list with 16 Humans but only 2 Wizards. The
  // suggestion itself is legitimate — Human clears the threshold — but the
  // Wizard group must not appear in the explanation *or* contribute to the
  // score. A two-card group is noise, and scoring on it would rank this
  // commander above one whose signals are all real.
  const wizards = [
    makeCard({ name: 'Viscera Seer', color_identity: JSON.stringify(['B']), creature_types: JSON.stringify(['Wizard']) }),
    makeCard({ name: 'Vizkopa Guildmage', color_identity: JSON.stringify(['B']), creature_types: JSON.stringify(['Wizard']) }),
  ];
  const humans = Array.from({ length: 16 }, (_, i) =>
    makeCard({ name: `Human ${i}`, color_identity: JSON.stringify(['B']), creature_types: JSON.stringify(['Human']) })
  );
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Human', 'Wizard']),
  });

  const ownedEntries = [...wizards, ...humans].map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);

  assert.strictEqual(suggestions.length, 1);
  // Shown to the user: Human only, no empty-ish Wizard group.
  assert.deepStrictEqual(
    suggestions[0].tribeSupport.map((t) => t.type),
    ['Human']
  );
  // Counted by the engine: likewise Human only.
  assert.deepStrictEqual(suggestions[0].matchedCreatureTypes, ['Human']);
  // And the score reflects one tribal signal, not two: 16 of the 18 castable
  // cards back the Human tribe, and nothing is scored for the Wizards.
  assert.strictEqual(suggestions[0].score, (16 / 18) * 15);
});

check("a matched theme still requires the candidate's own text to show the same signal", () => {
  // The list is sacrifice-heavy, but the candidate itself never mentions it —
  // a global match on the profile alone should not be enough.
  const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'This card does something else entirely.',
  });
  const ownedEntries = ownedCards.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
  assert.strictEqual(suggestions.length, 0);
});

check('a theme with enough global matches but too few after identity-narrowing is dropped entirely', () => {
  // Three sacrifice cards match globally, but only two of them are actually
  // playable under this candidate's colour identity — below the threshold
  // once narrowed, so this should affect scoring, not just display.
  const fitsA = makeCard({ name: 'Fits A', color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
  const fitsB = makeCard({ name: 'Fits B', color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature.' });
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
  const ownedEntries = [owned(fitsA), owned(fitsB), owned(doesNotFit)];
  const profile = buildCollectionProfile(ownedEntries);
  // Globally, sacrifice has 3 matches — clears the raw MIN_SIGNAL_COUNT.
  assert.strictEqual(profile.themeCounts['sacrifice'], 3);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
  // But only 2 of those 3 fit this candidate's identity, so it must not count.
  assert.strictEqual(suggestions.length, 0);
});

check("only cards that fit the candidate's colour identity count toward includedCardCount", () => {
  const fits = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
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
  const ownedEntries = [...fits.map((c) => owned(c)), owned(doesNotFit, 5)];
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
  assert.strictEqual(suggestions.length, 1);
  assert.strictEqual(suggestions[0].includedCardCount, 3);
});

// --- archetypes --------------------------------------------------------

check('Aristocrats requires at least 2 of its 3 component themes', () => {
  const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const dies = Array.from({ length: 3 }, (_, i) =>
    makeCard({
      name: `Dies ${i}`,
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Whenever a creature you control dies, drain 1 life.',
    })
  );
  const candidate = makeCard({
    name: 'Aristocrats Commander',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature. Whenever a creature you control dies, draw a card.',
  });
  const ownedEntries = [...sac, ...dies].map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].matchedThemes.includes('Aristocrats'));
});

check('a single matching component theme is not enough for Aristocrats', () => {
  const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const candidate = makeCard({
    name: 'Just Sacrifice',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const ownedEntries = sac.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
  assert.strictEqual(suggestions.length, 1);
  assert.strictEqual(suggestions[0].matchedThemes.includes('Aristocrats'), false);
  assert.ok(suggestions[0].matchedThemes.includes('Sacrifice'));
});

// --- scoring measures focus, not colour reach ------------------------------

check('a focused commander outranks a wider one that matches less', () => {
  // The bug this replaced: colour identity used to be worth more than every
  // synergy term combined, so a five-colour commander that could cast the
  // whole list beat a mono-black one that actually matched it twice over.
  const black = Array.from({ length: 6 }, (_, i) =>
    makeCard({
      name: `Black ${i}`,
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Return a card from your graveyard to your hand. Draw a card.',
    })
  );
  const azorius = Array.from({ length: 6 }, (_, i) =>
    makeCard({
      name: `WU ${i}`,
      color_identity: JSON.stringify(['W', 'U']),
      oracle_text: 'Exile a card from your graveyard.',
    })
  );
  const mono = makeCard({
    name: 'Mono-Black Synergist',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Return a card from your graveyard to your hand. Draw a card.',
  });
  const wubrg = makeCard({
    name: 'Five-Colour Generalist',
    color_identity: JSON.stringify(['W', 'U', 'B', 'R', 'G']),
    oracle_text: 'Exile a card from your graveyard.',
  });

  const ownedEntries = [...black, ...azorius].map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(wubrg), solo(mono)], profile, ownedEntries);

  // Mono-black matches two themes at full density across its 6 castable
  // cards; the five-colour one matches a single theme and earns nothing for
  // being able to cast twice as much.
  assert.strictEqual(suggestions[0].cards[0].name, 'Mono-Black Synergist');
  assert.strictEqual(suggestions[0].score, 20);
  assert.strictEqual(suggestions[1].score, 10);
});

check('breadth alone never scores — identity only decides what is eligible', () => {
  // Same signal, same density, different colour reach: the scores must match.
  const cards = (identity: string[], n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) =>
      makeCard({
        name: `${prefix} ${i}`,
        color_identity: JSON.stringify(identity),
        oracle_text: 'Sacrifice a creature: draw a card.',
      })
    );
  const narrowList = cards(['B'], 4, 'Mono');
  const wideList = [...cards(['B'], 4, 'W1'), ...cards(['W', 'U'], 4, 'W2')];

  const narrowCandidate = makeCard({
    name: 'Narrow',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const wideCandidate = makeCard({
    name: 'Wide',
    color_identity: JSON.stringify(['W', 'U', 'B', 'R', 'G']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });

  const narrowOwned = narrowList.map((c) => owned(c));
  const wideOwned = wideList.map((c) => owned(c));
  const narrow = scoreCommanders([solo(narrowCandidate)], buildCollectionProfile(narrowOwned), narrowOwned);
  const wide = scoreCommanders([solo(wideCandidate)], buildCollectionProfile(wideOwned), wideOwned);

  // 4 of 4 castable cards versus 8 of 8 — both fully focused, so equal.
  assert.strictEqual(narrow[0].score, wide[0].score);
});

// --- sorting -------------------------------------------------------------

check('suggestions are sorted by score, highest first', () => {
  const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const vampires = Array.from({ length: 3 }, (_, i) =>
    makeCard({
      name: `Vampire ${i}`,
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Vampire']),
    })
  );
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
  const ownedEntries = [...sac, ...vampires].map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(weak), solo(strong)], profile, ownedEntries);
  assert.strictEqual(suggestions.length, 2);
  assert.strictEqual(suggestions[0].cards[0].name, 'Strong');
  assert.ok(suggestions[0].score > suggestions[1].score);
});

// --- Partner-pair union semantics (702.124e) -------------------------------

check("a pair's colour identity is the union of both cards, not either alone", () => {
  const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['U']) });
  const partnerA = makeCard({ name: 'A', color_identity: JSON.stringify(['U']) });
  const partnerB = makeCard({
    name: 'B',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const ownedEntries = ownedCards.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([{ cards: [partnerA, partnerB] }], profile, ownedEntries);
  // The owned cards are mono-U; the pair's union identity (U+B) covers them
  // even though partnerB alone (mono-B) would not.
  assert.strictEqual(suggestions.length, 1);
  assert.deepStrictEqual(suggestions[0].cards.map((c) => c.name).sort(), ['A', 'B']);
});

check("a pair matches a theme that only one half's own text shows", () => {
  const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const silent = makeCard({ name: 'Silent Half', color_identity: JSON.stringify(['B']), oracle_text: '' });
  const vocal = makeCard({
    name: 'Vocal Half',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const ownedEntries = ownedCards.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([{ cards: [silent, vocal] }], profile, ownedEntries);
  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].matchedThemes.includes('Sacrifice'));
});

check('a pair matches a creature type that only one half has', () => {
  const vampiresOwned = Array.from({ length: 3 }, (_, i) =>
    makeCard({
      name: `Owned Vampire ${i}`,
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Vampire']),
    })
  );
  const nonVampireHalf = makeCard({ name: 'Non-Vampire Half', color_identity: JSON.stringify(['B']) });
  const vampireHalf = makeCard({
    name: 'Vampire Half',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Vampire']),
  });
  const ownedEntries = vampiresOwned.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders(
    [{ cards: [nonVampireHalf, vampireHalf] }],
    profile,
    ownedEntries
  );
  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].matchedCreatureTypes.includes('Vampire'));
});

if (failures > 0) {
  console.error(`\n${failures} synergy cases failed.`);
  process.exit(1);
}
console.log('\nAll synergy cases passed.');
