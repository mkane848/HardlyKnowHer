/**
 * Commander pairing rules — the mechanics that let a deck have two cards in
 * the command zone rather than one.
 *
 * Detection reads the oracle text and type line rather than Scryfall's
 * `keywords` array, because the array doesn't consistently carry the
 * pairing abilities (Backgrounds are a subtype, not a keyword; "Partner
 * with" and the restricted "Partner — X" variants collapse to plain
 * "Partner"). The text is what the rules actually key off, and it's what
 * these can be tested against deterministically.
 *
 * Covered here:
 *   Partner                  two cards that each have plain Partner
 *   Partner with [name]      pairs only with the one card it names
 *   Partner — [group]        pairs only within its own named group
 *   Choose a Background      a creature plus a Background enchantment
 *   Friends forever          two cards that each have Friends forever
 *   Doctor's companion       a companion plus a legendary Time Lord Doctor
 */

export type PairingKind =
  | 'partner'
  | 'partner-with'
  | 'partner-restricted'
  | 'choose-background'
  | 'background'
  | 'friends-forever'
  | 'doctors-companion'
  | 'time-lord-doctor';

export interface Pairing {
  kind: PairingKind;
  /**
   * For 'partner-with', the card it names. For 'partner-restricted', the
   * group label ("Father & Son"). Null for the kinds that pair on the
   * mechanic alone.
   */
  label: string | null;
}

/** How each mechanic is described in the UI. */
export const PAIRING_LABELS: Record<PairingKind, string> = {
  partner: 'Partner',
  'partner-with': 'Partner with',
  'partner-restricted': 'Partner',
  'choose-background': 'Choose a Background',
  background: 'Background',
  'friends-forever': 'Friends forever',
  'doctors-companion': "Doctor's companion",
  'time-lord-doctor': 'Doctor',
};

// Anchored to the start of a line so the reminder text these abilities carry
// ("(You can have two commanders if both have partner.)") can't match on its
// own, and so an unrelated mid-sentence mention of a word never counts.
const PARTNER_WITH = /^Partner with ([^\n(]+)/m;
const PARTNER_RESTRICTED = /^Partner\s*[—-]\s*([^\n(]+)/m;
const PARTNER_PLAIN = /^Partner\b(?!\s+with\b)(?!\s*[—-])/m;
const CHOOSE_BACKGROUND = /^Choose a Background\b/m;
const FRIENDS_FOREVER = /^Friends forever\b/m;
const DOCTORS_COMPANION = /^Doctor's companion\b/m;

/**
 * Identifies which pairing mechanic a card has, if any.
 *
 * Type-line checks come first: a Background and a Time Lord Doctor are
 * identified by what they *are*, and neither carries the pairing wording in
 * its own text — it's the partner side that names them.
 */
export function detectPairing(typeLine: string | null, oracleText: string | null): Pairing | null {
  const types = typeLine ?? '';
  const text = oracleText ?? '';

  if (/\bBackground\b/.test(types)) return { kind: 'background', label: null };
  if (/\bTime Lord Doctor\b/.test(types)) return { kind: 'time-lord-doctor', label: null };

  const withMatch = text.match(PARTNER_WITH);
  if (withMatch) return { kind: 'partner-with', label: withMatch[1].trim() };

  const restrictedMatch = text.match(PARTNER_RESTRICTED);
  if (restrictedMatch) return { kind: 'partner-restricted', label: restrictedMatch[1].trim() };

  if (PARTNER_PLAIN.test(text)) return { kind: 'partner', label: null };
  if (CHOOSE_BACKGROUND.test(text)) return { kind: 'choose-background', label: null };
  if (FRIENDS_FOREVER.test(text)) return { kind: 'friends-forever', label: null };
  if (DOCTORS_COMPANION.test(text)) return { kind: 'doctors-companion', label: null };

  return null;
}

export interface PairingSide {
  name: string;
  pairing: Pairing;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sameLabel = (a: string | null, b: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Whether two cards may sit in the command zone together.
 *
 * Symmetric, and deliberately strict: "Partner with" pairs only with the
 * card it names (not with the generic Partner pool), and a restricted
 * "Partner — X" pairs only inside its own group.
 */
export function canPair(a: PairingSide, b: PairingSide): boolean {
  if (sameName(a.name, b.name)) return false;

  const kinds = [a.pairing.kind, b.pairing.kind];
  const has = (kind: PairingKind) => kinds.includes(kind);

  if (a.pairing.kind === 'partner' && b.pairing.kind === 'partner') return true;
  if (a.pairing.kind === 'friends-forever' && b.pairing.kind === 'friends-forever') return true;

  if (a.pairing.kind === 'partner-restricted' && b.pairing.kind === 'partner-restricted') {
    return sameLabel(a.pairing.label, b.pairing.label);
  }

  // "Partner with" is printed on both halves naming each other, but only one
  // side needs to name the other for the pair to be legal.
  if (a.pairing.kind === 'partner-with' && sameName(a.pairing.label ?? '', b.name)) return true;
  if (b.pairing.kind === 'partner-with' && sameName(b.pairing.label ?? '', a.name)) return true;

  if (has('choose-background') && has('background')) return true;
  if (has('doctors-companion') && has('time-lord-doctor')) return true;

  return false;
}

/** The colour identity of a pair is the union of both halves. */
export function combineIdentity(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
