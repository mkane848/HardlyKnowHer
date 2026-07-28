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
    back_image_uri: null,
    back_name: null,
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

check('a candidate with zero color-identity overlap is not suggested', () => {
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

check('a candidate is suggested once color identity fits and a signal clears the threshold', () => {
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
  // Cares about both types by name, so the *only* thing separating them is
  // the card count — otherwise this would be testing the cares-about gate
  // rather than the threshold.
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Human', 'Wizard']),
    oracle_text: 'Whenever another Human or Wizard you control enters, draw a card.',
  });

  const ownedEntries = [...wizards, ...humans].map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);

  assert.strictEqual(suggestions.length, 1);
  // Shown to the user: Human only, no empty-ish Wizard group.
  assert.deepStrictEqual(
    suggestions[0].kindredSupport.map((t) => t.type),
    ['Human']
  );
  // Counted by the engine: likewise Human only.
  assert.deepStrictEqual(suggestions[0].matchedCreatureTypes, ['Human']);
  // And the score reflects one kindred signal, not two: 16 of the 18 castable
  // cards back the Human kindred group (breadth), plus a depth bonus for the
  // 12 cards beyond the 5-card floor — nothing is scored for the Wizards.
  assert.strictEqual(suggestions[0].score, (16 / 18) * 15 + (16 - 5 + 1) * 1);
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
  // playable under this candidate's color identity — below the threshold
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

check("only cards that fit the candidate's color identity count toward includedCardCount", () => {
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

// --- sacrifice requires sacrificing something, not itself ------------------

check('a fetch land sacrificing itself is not a Sacrifice signal', () => {
  // Arid Mesa's actual line: "..., Sacrifice Arid Mesa: Search your
  // library...". It sacrifices only itself as a cost, which reads
  // nothing like the creature-sacrifice archetype even though the bare
  // word "sacrifice" appears.
  const fetches = Array.from({ length: 3 }, (_, i) =>
    makeCard({
      name: `Fetch ${i}`,
      type_line: 'Land',
      color_identity: JSON.stringify(['R', 'W']),
      oracle_text: `Sacrifice Fetch ${i}: Search your library for a Mountain or Plains card.`,
    })
  );
  const profile = buildCollectionProfile(fetches.map((c) => owned(c)));
  assert.strictEqual(profile.themeCounts['sacrifice'], undefined);
});

check('sacrificing a creature, an indefinite object, still counts', () => {
  const village = makeCard({ name: 'Village Rites', oracle_text: 'As an additional cost to cast this spell, sacrifice a creature.' });
  const woe = makeCard({ name: 'Woe Strider', oracle_text: 'Sacrifice another creature or artifact: scry 1.' });
  const profile = buildCollectionProfile([owned(village), owned(woe)]);
  assert.strictEqual(profile.themeCounts['sacrifice'], 2);
});

// --- "Card Draw" is not its own synergy -------------------------------------

check('drawing cards alone is not detected as a theme', () => {
  const drawer = makeCard({ oracle_text: 'Draw a card.' });
  const profile = buildCollectionProfile([owned(drawer, 5)]);
  assert.strictEqual(profile.themeCounts['draw'], undefined);
  assert.deepStrictEqual(Object.keys(profile.themeCards).includes('draw'), false);
});

// --- kindred requires caring, not just sharing -----------------------------

/** N distinct creatures of one type, so a kindred signal can clear the threshold. */
function creaturesOfType(n: number, type: string): CardRow[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({
      name: `${type} ${i}`,
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify([type]),
    })
  );
}

check('merely being a creature type is not a kindred signal', () => {
  // Silas Renn is a Human whose text never mentions Humans. A pile of Humans
  // in the list says nothing about him, and used to suggest him anyway.
  const humans = creaturesOfType(8, 'Human');
  const silas = makeCard({
    name: 'Silas Renn, Seeker Adept',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Human']),
    oracle_text: 'Whenever Silas Renn deals combat damage to a player, choose target artifact card in your graveyard.',
  });
  const ownedEntries = humans.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(silas)], profile, ownedEntries);
  assert.deepStrictEqual(
    suggestions.flatMap((s) => s.matchedCreatureTypes),
    []
  );
});

check('a commander whose text calls out the type does match it', () => {
  const goblins = creaturesOfType(8, 'Goblin');
  const krenko = makeCard({
    name: 'Krenko, Mob Boss',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Goblin']),
    oracle_text: 'Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
  });
  const ownedEntries = goblins.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(krenko)], profile, ownedEntries);
  assert.strictEqual(suggestions.length, 1);
  assert.deepStrictEqual(suggestions[0].matchedCreatureTypes, ['Goblin']);
});

check('an irregular plural still counts — "Elves you control" matches Elf', () => {
  // Lathril never says "Elf", only "Elves". A naive type + "s" would miss one
  // of the most recognisable kindred commanders in the format.
  const elves = creaturesOfType(8, 'Elf');
  const lathril = makeCard({
    name: 'Lathril, Blade of the Elves',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Elf']),
    oracle_text: 'Tap ten untapped Elves you control: Create twenty 1/1 black Elf Warrior creature tokens.',
  });
  const ownedEntries = elves.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(lathril)], profile, ownedEntries);
  assert.deepStrictEqual(suggestions[0]?.matchedCreatureTypes, ['Elf']);
});

check('caring about a type it does not have still counts', () => {
  // Ghoulcaller Gisa is a Human Wizard and one of the best Zombie commanders
  // there is. Requiring the commander to *be* the type would miss her.
  const zombies = creaturesOfType(8, 'Zombie');
  const gisa = makeCard({
    name: 'Ghoulcaller Gisa',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Human', 'Wizard']),
    oracle_text: 'Sacrifice another creature: Create X 2/2 black Zombie creature tokens.',
  });
  const ownedEntries = zombies.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(gisa)], profile, ownedEntries);
  assert.deepStrictEqual(suggestions[0]?.matchedCreatureTypes, ['Zombie']);
});

check('a pair matches a type only one half cares about (702.124e)', () => {
  const slivers = creaturesOfType(8, 'Sliver');
  const silent = makeCard({
    name: 'Silent Half',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Draw a card.',
  });
  const caring = makeCard({
    name: 'The First Sliver',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sliver spells you cast have cascade.',
  });
  const ownedEntries = slivers.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([{ cards: [silent, caring] }], profile, ownedEntries);
  assert.deepStrictEqual(suggestions[0]?.matchedCreatureTypes, ['Sliver']);
});

// --- scoring measures focus, not color reach ------------------------------

check('a focused commander outranks a wider one that matches less', () => {
  // The bug this replaced: color identity used to be worth more than every
  // synergy term combined, so a five-color commander that could cast the
  // whole list beat a mono-black one that actually matched it twice over.
  const black = Array.from({ length: 6 }, (_, i) =>
    makeCard({
      name: `Black ${i}`,
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Return a card from your graveyard to your hand. You gain 1 life.',
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
    oracle_text: 'Return a card from your graveyard to your hand. You gain 1 life.',
  });
  const wubrg = makeCard({
    name: 'Five-Color Generalist',
    color_identity: JSON.stringify(['W', 'U', 'B', 'R', 'G']),
    oracle_text: 'Exile a card from your graveyard.',
  });

  const ownedEntries = [...black, ...azorius].map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(wubrg), solo(mono)], profile, ownedEntries);

  // Mono-black matches two themes at full density across its 6 castable
  // cards; the five-color one matches a single theme at full density across
  // 12. Neither earns anything for color reach by itself — five-color's
  // higher score comes entirely from citing more actual cards (depth), the
  // same as it would if a mono-color list simply had more copies to show.
  assert.strictEqual(suggestions[0].cards[0].name, 'Mono-Black Synergist');
  // Two themes at density 1 (10 each): diminishing breadth (10 + 10*0.7 = 17)
  // plus a depth bonus of 2 per theme (6 cards - 5 floor + 1) = 21.
  assert.strictEqual(suggestions[0].score, 17 + 4);
  // One theme at density 1 (10): breadth 10, plus depth bonus of 8
  // (12 cards - 5 floor + 1) = 18.
  assert.strictEqual(suggestions[1].score, 10 + 8);
});

check('identity breadth that adds no new matching cards never helps, only dilutes', () => {
  // Same 4 signal-supporting cards in both cases. The "wide" candidate's
  // broader identity lets in 4 more cards from the list, but none of them
  // support the signal — so it has strictly more castable cards and the
  // exact same synergy. That must not score better than the narrow
  // candidate; density (unchanged numerator, bigger denominator) means it
  // scores worse, and depth (keyed off the unchanged 4 matching cards, still
  // under DEEP_SIGNAL_COUNT) is unaffected either way.
  const sac = Array.from({ length: 4 }, (_, i) =>
    makeCard({ name: `Sac ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature: draw a card.' })
  );
  const irrelevant = Array.from({ length: 4 }, (_, i) =>
    makeCard({ name: `Irrelevant ${i}`, color_identity: JSON.stringify(['W', 'U']), oracle_text: 'Vanilla text.' })
  );

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

  const ownedEntries = [...sac, ...irrelevant].map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const narrow = scoreCommanders([solo(narrowCandidate)], profile, ownedEntries);
  const wide = scoreCommanders([solo(wideCandidate)], profile, ownedEntries);

  // Narrow: 4/4 density * 10 = 10, no depth bonus (4 cards < 5 floor).
  assert.strictEqual(narrow[0].score, 10);
  // Wide: same 4 matching cards, but an 8-card castable pool: 4/8 * 10 = 5.
  assert.strictEqual(wide[0].score, 5);
  assert.ok(wide[0].score < narrow[0].score);
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
    // Names the type, so it earns the kindred signal on top of the theme
    // both candidates share. Being a Vampire alone would not.
    oracle_text: 'Sacrifice a creature: draw a card. Other Vampires you control get +1/+1.',
  });
  const ownedEntries = [...sac, ...vampires].map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(weak), solo(strong)], profile, ownedEntries);
  assert.strictEqual(suggestions.length, 2);
  assert.strictEqual(suggestions[0].cards[0].name, 'Strong');
  assert.ok(suggestions[0].score > suggestions[1].score);
});

// --- Partner-pair union semantics (702.124e) -------------------------------

check("a pair's color identity is the union of both cards, not either alone", () => {
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

check('a pair does not match a creature type it merely has', () => {
  // The positive case lives in "a pair matches a type only one half cares
  // about". This is its mirror: one half *is* a Vampire, neither half's text
  // says so, and the pair is still suggested on its sacrifice theme — so a
  // missing Vampire tag here is the rule working, not the whole match failing.
  const vampiresOwned = Array.from({ length: 3 }, (_, i) =>
    makeCard({
      name: `Owned Vampire ${i}`,
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Vampire']),
    })
  );
  const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const nonVampireHalf = makeCard({
    name: 'Non-Vampire Half',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const vampireHalf = makeCard({
    name: 'Vampire Half',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Vampire']),
  });
  const ownedEntries = [...vampiresOwned, ...sac].map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders(
    [{ cards: [nonVampireHalf, vampireHalf] }],
    profile,
    ownedEntries
  );
  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].matchedThemes.includes('Sacrifice'));
  assert.ok(!suggestions[0].matchedCreatureTypes.includes('Vampire'));
});

// --- depth bonus: a signal is worth more once it clears DEEP_SIGNAL_COUNT --

check('a signal right at the deep-synergy floor (5 cards) earns a small bonus', () => {
  const ownedCards = sacrificeCards(5, { color_identity: JSON.stringify(['B']) });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const ownedEntries = ownedCards.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
  // Breadth: 5/5 density * 10 = 10. Depth: (5 - 5 + 1) * 1 = 1 bonus card.
  assert.strictEqual(suggestions[0].score, 11);
});

check('one card short of the deep-synergy floor earns no bonus at all', () => {
  const ownedCards = sacrificeCards(4, { color_identity: JSON.stringify(['B']) });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card.',
  });
  const ownedEntries = ownedCards.map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
  // Breadth only: 4/4 density * 10 = 10. No depth bonus below the floor.
  assert.strictEqual(suggestions[0].score, 10);
});

// --- diminishing returns: signals past the strongest are worth less --------

check('a second signal at equal strength is discounted, not added in full', () => {
  const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const graveyard = Array.from({ length: 3 }, (_, i) =>
    makeCard({ name: `Grave ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'Put a card into your graveyard.' })
  );
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sacrifice a creature: draw a card. Put a card into your graveyard.',
  });
  const ownedEntries = [...sac, ...graveyard].map((c) => owned(c));
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(candidate)], profile, ownedEntries);
  // Both themes: 3/6 density * 10 = 5 each. A naive sum would be 10; instead
  // the second-ranked signal is discounted by DIMINISHING_FACTOR (0.7):
  // 5 + 5*0.7 = 8.5. Neither clears the 5-card depth floor.
  assert.strictEqual(suggestions[0].score, 8.5);
});

// --- the headline case: depth can outrank breadth ---------------------------

check('one deep synergy outranks a commander with several shallow ones', () => {
  // This is the scenario the depth bonus and diminishing returns exist for:
  // a commander whose whole case is ten landfall cards in a 50-card pool
  // should beat one that just barely clears the threshold on four unrelated
  // themes. Under the old pure-density-sum formula this ranked backwards —
  // 4 * (3/50 * 10) = 2.4 for the shallow spread beat 1 * (10/50 * 10) = 2.0
  // for the deep commander, since nothing discounted piling up signals or
  // rewarded a signal's raw depth.
  //
  // The four shallow themes are deliberately chosen with no archetype in
  // common (unlike Sacrifice+Tokens, which would consolidate into
  // Aristocrats and defeat the point of this test — that case is covered
  // separately below).
  const landfall = Array.from({ length: 10 }, (_, i) =>
    makeCard({
      name: `Landfall ${i}`,
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Whenever a land enters the battlefield under your control, scry 1.',
    })
  );
  const graveyard = Array.from({ length: 3 }, (_, i) =>
    makeCard({ name: `Grave ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'Put a card into your graveyard.' })
  );
  const lifegain = Array.from({ length: 3 }, (_, i) =>
    makeCard({ name: `Lifegain ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'You gain 3 life.' })
  );
  const counters = Array.from({ length: 3 }, (_, i) =>
    makeCard({ name: `Counter ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'Put a +1/+1 counter on target creature.' })
  );
  const planeswalkers = Array.from({ length: 3 }, (_, i) =>
    makeCard({ name: `Walker ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'Planeswalkers you control have hexproof.' })
  );
  const filler = Array.from({ length: 28 }, (_, i) =>
    makeCard({ name: `Filler ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'This card does something else entirely.' })
  );

  const deepCandidate = makeCard({
    name: 'Landfall Deep',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Whenever a land enters the battlefield under your control, draw a card.',
  });
  const shallowCandidate = makeCard({
    name: 'Generic Spread',
    color_identity: JSON.stringify(['B']),
    oracle_text:
      'Put a card into your graveyard. You gain 3 life. Put a +1/+1 counter on target creature. Planeswalkers you control have hexproof.',
  });

  const ownedEntries = [...landfall, ...graveyard, ...lifegain, ...counters, ...planeswalkers, ...filler].map((c) =>
    owned(c)
  );
  assert.strictEqual(ownedEntries.length, 50);
  const profile = buildCollectionProfile(ownedEntries);
  const suggestions = scoreCommanders([solo(deepCandidate), solo(shallowCandidate)], profile, ownedEntries);

  assert.strictEqual(suggestions[0].cards[0].name, 'Landfall Deep');
  // Deep: breadth 10/50*10 = 2, depth (10-5+1)*1 = 6 -> 8.
  assert.strictEqual(suggestions[0].score, 8);
  // Shallow: four themes at 3/50*10 = 0.6 each, diminished:
  // 0.6*(1 + 0.7 + 0.49 + 0.343) = 1.5198. No depth bonus (3 < 5 each).
  assert.ok(Math.abs(suggestions[1].score - 1.5198) < 1e-9);
});

// --- archetypes pay once, not per component -------------------------------

check("an archetype's component themes stop scoring once the archetype fires", () => {
  // Aristocrats fires on 2 of {sacrifice, deathTriggers, tokens}. Giving it
  // exactly the two components it needs means every one of the archetype's
  // cards would otherwise also be scored twice, once under each component
  // theme. Both components must still show in the "why" panel, but only the
  // archetype should contribute score.
  const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const dies = Array.from({ length: 3 }, (_, i) =>
    makeCard({ name: `Dies ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'Whenever a creature you control dies, drain 1 life.' })
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
  // Displayed: all three, components included.
  assert.deepStrictEqual(
    suggestions[0].themeSupport.map((t) => t.label).sort(),
    ['Aristocrats', 'Death Triggers', 'Sacrifice']
  );
  // Scored: only the archetype's 6 deduplicated cards, once.
  // Breadth: 6/6 density * 20 = 20. Depth: (6 - 5 + 1) * 1 = 2. Total 22.
  assert.strictEqual(suggestions[0].score, 22);
});

if (failures > 0) {
  console.error(`\n${failures} synergy cases failed.`);
  process.exit(1);
}
console.log('\nAll synergy cases passed.');
