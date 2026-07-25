/**
 * Tests for command-zone pairing: detecting which mechanic a card has, and
 * which cards may legally share a command zone. Run with: npm test
 *
 * The oracle text in these cases is copied from real cards, reminder text
 * included, because the reminder text is exactly what naive detection trips
 * over — every one of these abilities restates the word "partner" inside
 * parentheses.
 */
import assert from 'node:assert';
import { canPair, combineIdentity, detectPairing, type Pairing } from '../src/services/partners';

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

const CREATURE = 'Legendary Creature — Human Cleric';

// --- detection ---------------------------------------------------------

check('plain Partner is detected past its reminder text', () => {
  const text =
    'When Tymna the Weaver deals combat damage to a player, draw a card.\n' +
    'Partner (You can have two commanders if both have partner.)';
  assert.deepStrictEqual(detectPairing(CREATURE, text), { kind: 'partner', label: null });
});

check('"Partner with [name]" captures the named card, not the reminder', () => {
  const text =
    'Partner with Chakram Slinger (When this creature enters, target player may put ' +
    'Chakram Slinger into their hand from their library, then shuffle.)\n' +
    'Whenever you cast a spell, untap target creature.';
  assert.deepStrictEqual(detectPairing(CREATURE, text), {
    kind: 'partner-with',
    label: 'Chakram Slinger',
  });
});

check('restricted "Partner — [group]" captures the group label', () => {
  const text = 'Partner — Father & Son (You can have two commanders if both have Partner — Father & Son.)';
  assert.deepStrictEqual(detectPairing(CREATURE, text), {
    kind: 'partner-restricted',
    label: 'Father & Son',
  });
});

check('a Background is identified by its type line', () => {
  const text = 'Commander creatures you own have "Whenever this creature attacks, draw a card."';
  assert.deepStrictEqual(detectPairing('Legendary Enchantment — Background', text), {
    kind: 'background',
    label: null,
  });
});

check('"Choose a Background" is detected on the creature side', () => {
  const text = 'Choose a Background (You can have a Background as a second commander.)';
  assert.deepStrictEqual(detectPairing(CREATURE, text), { kind: 'choose-background', label: null });
});

check('Friends forever and Doctor\'s companion are detected', () => {
  assert.deepStrictEqual(
    detectPairing(CREATURE, 'Friends forever (You can have two commanders if both have friends forever.)'),
    { kind: 'friends-forever', label: null }
  );
  assert.deepStrictEqual(
    detectPairing(CREATURE, "Doctor's companion (You can have two commanders if the other is the Doctor.)"),
    { kind: 'doctors-companion', label: null }
  );
});

check('a Time Lord Doctor is identified by its creature types', () => {
  assert.deepStrictEqual(detectPairing('Legendary Creature — Time Lord Doctor', 'Flying'), {
    kind: 'time-lord-doctor',
    label: null,
  });
});

check('a card that merely mentions partners mid-sentence is not pairable', () => {
  const text = 'Whenever an opponent and their partner attack, you may draw a card.';
  assert.strictEqual(detectPairing(CREATURE, text), null);
});

check('an ordinary legendary creature has no pairing', () => {
  assert.strictEqual(detectPairing(CREATURE, 'Flying, vigilance'), null);
  assert.strictEqual(detectPairing(null, null), null);
});

// --- compatibility -----------------------------------------------------

const side = (name: string, pairing: Pairing) => ({ name, pairing });
const partner = (name: string) => side(name, { kind: 'partner', label: null });

check('two plain Partner cards can pair', () => {
  assert.strictEqual(canPair(partner('Tymna the Weaver'), partner('Thrasios, Triton Hero')), true);
});

check('a card cannot pair with itself', () => {
  assert.strictEqual(canPair(partner('Tymna the Weaver'), partner('Tymna the Weaver')), false);
});

check('"Partner with" pairs only with the card it names', () => {
  const retriever = side('Chakram Retriever', { kind: 'partner-with', label: 'Chakram Slinger' });
  const slinger = side('Chakram Slinger', { kind: 'partner-with', label: 'Chakram Retriever' });

  assert.strictEqual(canPair(retriever, slinger), true);
  // Naming it from one side is enough, even if the other half isn't loaded.
  assert.strictEqual(canPair(retriever, side('Chakram Slinger', { kind: 'partner', label: null })), true);
  // But it must not fall back into the generic Partner pool.
  assert.strictEqual(canPair(retriever, partner('Tymna the Weaver')), false);
});

check('restricted partners pair only inside their own group', () => {
  const a = side('Elrond', { kind: 'partner-restricted', label: 'Father & Son' });
  const b = side('Elros', { kind: 'partner-restricted', label: 'Father & Son' });
  const other = side('Someone Else', { kind: 'partner-restricted', label: 'Survivors' });

  assert.strictEqual(canPair(a, b), true);
  assert.strictEqual(canPair(a, other), false);
  assert.strictEqual(canPair(a, partner('Tymna the Weaver')), false);
});

check('a Background pairs with "Choose a Background", and not with another Background', () => {
  const creature = side('Wilson, Refined Grizzly', { kind: 'choose-background', label: null });
  const background = side('Raised by Giants', { kind: 'background', label: null });
  const otherBackground = side('Cultist of the Absolute', { kind: 'background', label: null });

  assert.strictEqual(canPair(creature, background), true);
  assert.strictEqual(canPair(background, creature), true, 'compatibility is symmetric');
  assert.strictEqual(canPair(background, otherBackground), false);
  assert.strictEqual(canPair(creature, partner('Tymna the Weaver')), false);
});

check("Doctor's companion pairs with a Time Lord Doctor only", () => {
  const companion = side('Rose Tyler', { kind: 'doctors-companion', label: null });
  const doctor = side('The Tenth Doctor', { kind: 'time-lord-doctor', label: null });

  assert.strictEqual(canPair(companion, doctor), true);
  assert.strictEqual(canPair(companion, partner('Tymna the Weaver')), false);
  assert.strictEqual(
    canPair(doctor, side('The Eleventh Doctor', { kind: 'time-lord-doctor', label: null })),
    false,
    'two Doctors cannot pair with each other'
  );
});

check('Friends forever pairs only with Friends forever', () => {
  const a = side('Will Byers', { kind: 'friends-forever', label: null });
  const b = side('Mike Wheeler', { kind: 'friends-forever', label: null });

  assert.strictEqual(canPair(a, b), true);
  assert.strictEqual(canPair(a, partner('Tymna the Weaver')), false);
});

// --- identity ----------------------------------------------------------

check('a pair takes the union of both colour identities', () => {
  assert.deepStrictEqual(combineIdentity(['W'], ['U', 'B']).sort(), ['B', 'U', 'W']);
  assert.deepStrictEqual(combineIdentity(['G'], ['G']), ['G'], 'no duplicates');
  assert.deepStrictEqual(combineIdentity([], ['R']), ['R'], 'colorless contributes nothing');
});

if (failures > 0) {
  console.error(`\n${failures} pairing cases failed.`);
  process.exit(1);
}
console.log('\nAll pairing cases passed.');
