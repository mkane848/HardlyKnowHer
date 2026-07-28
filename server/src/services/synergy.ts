import type { CardRow } from '../types';
import type { CommanderUnit } from './partners';

export interface OwnedCard {
  row: CardRow;
  quantity: number;
}

export interface CollectionProfile {
  colorCounts: Record<string, number>;
  creatureTypeCounts: Record<string, number>;
  themeCounts: Record<string, number>;
  keywordCounts: Record<string, number>;
  // Which cards produced each signal, so a suggestion can show its work
  // rather than just a count.
  themeCards: Record<string, OwnedCard[]>;
  creatureTypeCards: Record<string, OwnedCard[]>;
  keywordCards: Record<string, OwnedCard[]>;
  totalCards: number;
}

/** One of the user's cards, as cited in a suggestion's explanation. */
export interface SupportingCard {
  name: string;
  quantity: number;
  typeLine: string | null;
  isGameChanger: boolean;
  manaValue: number | null;
  // Carried so the UI can show the card itself when one of these is tapped,
  // rather than making the name a dead end.
  imageUri: string | null;
  backImageUri: string | null;
  backName: string | null;
  scryfallUri: string | null;
}

/** A theme (or archetype — see ARCHETYPES below) the commander shares with the list. */
export interface ThemeSupport {
  key: string;
  label: string;
  description: string;
  cards: SupportingCard[];
}

/** A creature type the commander cares about and the list can field. */
export interface KindredSupport {
  type: string;
  cards: SupportingCard[];
}

/** A keyword ability (e.g. Flying, Deathtouch) the commander shares with the list. */
export interface KeywordSupport {
  keyword: string;
  cards: SupportingCard[];
}

export interface CommanderSuggestion {
  cards: CardRow[];
  score: number;
  matchedThemes: string[];
  matchedCreatureTypes: string[];
  matchedKeywords: string[];
  includedCardCount: number;
  themeSupport: ThemeSupport[];
  kindredSupport: KindredSupport[];
  keywordSupport: KeywordSupport[];
  gameChangerCards: SupportingCard[];
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface ThemeDef {
  key: string;
  label: string;
  description: string;
  /** Any one of these matching the text counts as the theme being present. */
  patterns: RegExp[];
}

function theme(key: string, label: string, description: string, ...patterns: RegExp[]): ThemeDef {
  return { key, label, description, patterns };
}

function matchesTheme(theme: ThemeDef, text: string): boolean {
  return theme.patterns.some((pattern) => pattern.test(text));
}

// Simple oracle-text theme detection. This is deliberately a short, readable
// list rather than an exhaustive taxonomy — it's meant to be easy to extend
// by hand as you notice themes it's missing, not to be a complete model of
// Magic strategy. `description` is user-facing: it explains what the theme
// means when a suggestion is expanded.
const THEMES: ThemeDef[] = [
  theme(
    'sacrifice',
    'Sacrifice',
    'Cards that sacrifice creatures or other permanents for value.',
    // Requires an indefinite object ("a/another/target/this/three/…")
    // right after "sacrifice", not a specific card name. A fetch land's
    // own text reads "Sacrifice Arid Mesa: …" — it sacrifices only
    // itself, as a cost for an unrelated effect, which is not this
    // synergy even though the literal word "sacrifice" appears. Real
    // sacrifice-for-value cards are templated as "Sacrifice a
    // creature:", "sacrifice another artifact", "sacrifice it", etc.
    /\bsacrifice (a|an|another|your|this|that|target|it|them|up to \w+|one|two|three|four|five|\d+)\b/i
  ),
  theme(
    'graveyard',
    'Graveyard',
    'Cards that treat the graveyard as a resource rather than a dead zone.',
    /graveyard/i
  ),
  theme('counters', '+1/+1 Counters', 'Cards that place +1/+1 counters or care about them.', /\+1\/\+1 counter/i),
  theme(
    'tokens',
    'Tokens',
    'Cards that create tokens, giving you bodies to attack or sacrifice with.',
    /create[^.]*token/i
  ),
  theme('artifacts', 'Artifacts', 'Artifacts and the cards that care about them.', /artifact/i),
  theme('enchantments', 'Enchantments', 'Enchantments and the cards that care about them.', /enchantment/i),
  theme(
    'planeswalkers',
    'Planeswalkers',
    'Planeswalkers, and cards that protect or take advantage of having them.',
    /planeswalkers? you control/i,
    /whenever a planeswalker (enters|you control)/i
  ),
  theme(
    'equipment',
    'Equipment',
    'Equipment, and cards that care about equipping creatures.',
    // No trailing \b: real text includes "Equip {2}" (the keyword ability),
    // "Equipment", and "Equipped creatures you control" (the payoff side) —
    // a trailing boundary would reject "Equipped" right after matching "equip".
    /\bequip/i
  ),
  theme(
    'auras',
    'Auras',
    'Auras, and cards that care about enchanting creatures.',
    /\baura\b/i,
    /enchant creature/i
  ),
  theme(
    // Spellslinger is the real name for this archetype, not a generic
    // description — kept as one theme rather than a separate archetype
    // layer, since it already was that archetype under a blander label.
    'spellslinger',
    'Spellslinger',
    'Payoffs for casting instants and sorceries — the deck that wants to chain spells, not creatures.',
    /instant or sorcery spell/i,
    /whenever you cast an? (instant|sorcery)/i,
    /whenever you cast a noncreature spell/i,
    /instant and sorcery spells? (you cast )?costs? \{?\d/i
  ),
  theme('lifegain', 'Lifegain', 'Cards that gain life, or that trigger when you do.', /gain(s|ed)? \d*\s*life/i, /whenever you gain life/i),
  theme(
    'mill',
    'Mill',
    'Cards that move cards from a library into a graveyard.',
    /mills? (a|\d)/i,
    /into (their|your) graveyard from (their|your) library/i
  ),
  theme(
    'deathTriggers',
    'Death Triggers',
    'Cards that trigger when a creature dies, turning losses into value.',
    /whenever .* (dies|died)/i
  ),
  theme('landfall', 'Landfall', 'Cards that trigger when a land enters the battlefield.', /landfall/i, /whenever a land enters/i),
  theme(
    'reanimation',
    'Reanimation',
    'Cards that return creatures from the graveyard to the battlefield.',
    /return .* from your graveyard to the battlefield/i
  ),
  theme(
    'doublers',
    'Doublers & Multipliers',
    'Cards that double tokens, counters, or card draw, make triggers happen twice, or copy spells.',
    /would create (one or more )?tokens?[^.]*instead/i,
    /create twice (that many|as many) tokens/i,
    /would (put|distribute) one or more .*counters[^.]*instead/i,
    /twice that many .*counters/i,
    /would draw (a card|cards)[^.]*instead draw/i,
    /draws? an additional card/i,
    /triggers? an additional time/i,
    /copy (it\.|that spell|the (target|next) instant or sorcery)/i
  ),
];

// Keyword abilities that drive the "shared keywords" / "X matters" signal —
// e.g. a pile of Flying creatures suggesting a commander that also flies and
// cares about it. Sourced from Scryfall's `keywords` field per card, which is
// otherwise unused in this file.
//
// The Partner-family abilities are deliberately excluded: they're also
// surfaced in `keywords`, but they mean something structural (who can be your
// commander), not a thematic signal — showing "Partner" as a generic shared
// keyword tag would be a confusing echo of the dedicated partner/background
// handling, not a second, unrelated theme.
const EXCLUDED_KEYWORDS = new Set([
  'partner',
  'partner with',
  'friends forever',
  'choose a background',
  "doctor's companion",
]);

interface ArchetypeDef {
  key: string;
  label: string;
  description: string;
  /** Component theme keys this archetype is built from. */
  componentKeys: string[];
  /** How many of componentKeys must be satisfied for the archetype to apply. */
  minComponents: number;
}

// Archetypes are a named label for a *combination* of the themes above — the
// individual themes still show up on their own, but seeing "Aristocrats" as
// one line is more useful than inferring it from "Sacrifice, Death Triggers,
// Tokens" separately. Like everything else here, a candidate must show the
// same signals in its own text as the list does; see the note on Voltron
// below for what that costs.
const ARCHETYPES: ArchetypeDef[] = [
  {
    key: 'aristocrats',
    label: 'Aristocrats',
    description:
      'Sacrifice fodder for repeated death triggers, turning your own creatures dying into value or damage.',
    componentKeys: ['sacrifice', 'deathTriggers', 'tokens'],
    minComponents: 2,
  },
  {
    key: 'voltron',
    label: 'Voltron',
    description:
      "Stack Equipment and Auras onto one threat — often the commander — and win through a single hard-to-answer creature." +
      ' Only flags commanders whose own text engages with equipping or enchanting; a great Voltron target that never' +
      ' mentions either (evasive stats alone) will not be caught by this heuristic.',
    componentKeys: ['equipment', 'auras'],
    minComponents: 1,
  },
];

function toSupportingCard({ row, quantity }: OwnedCard): SupportingCard {
  return {
    name: row.name,
    quantity,
    typeLine: row.type_line,
    isGameChanger: !!row.game_changer,
    manaValue: row.cmc,
    imageUri: row.image_uri,
    backImageUri: row.back_image_uri ?? null,
    backName: row.back_name ?? null,
    scryfallUri: row.scryfall_uri,
  };
}

function dedupeCards(cards: SupportingCard[]): SupportingCard[] {
  const seen = new Map<string, SupportingCard>();
  for (const card of cards) seen.set(card.name, card);
  return [...seen.values()];
}

export function buildCollectionProfile(owned: OwnedCard[]): CollectionProfile {
  const colorCounts: Record<string, number> = {};
  const creatureTypeCounts: Record<string, number> = {};
  const themeCounts: Record<string, number> = {};
  const keywordCounts: Record<string, number> = {};
  const themeCards: Record<string, OwnedCard[]> = {};
  const creatureTypeCards: Record<string, OwnedCard[]> = {};
  const keywordCards: Record<string, OwnedCard[]> = {};
  let totalCards = 0;

  for (const entry of owned) {
    const { row, quantity } = entry;
    totalCards += quantity;

    for (const color of parseJsonArray(row.color_identity)) {
      colorCounts[color] = (colorCounts[color] ?? 0) + quantity;
    }

    for (const type of parseJsonArray(row.creature_types)) {
      creatureTypeCounts[type] = (creatureTypeCounts[type] ?? 0) + quantity;
      (creatureTypeCards[type] ??= []).push(entry);
    }

    for (const keyword of parseJsonArray(row.keywords)) {
      if (EXCLUDED_KEYWORDS.has(keyword.toLowerCase())) continue;
      keywordCounts[keyword] = (keywordCounts[keyword] ?? 0) + quantity;
      (keywordCards[keyword] ??= []).push(entry);
    }

    const text = row.oracle_text ?? '';
    for (const def of THEMES) {
      if (matchesTheme(def, text)) {
        themeCounts[def.key] = (themeCounts[def.key] ?? 0) + quantity;
        (themeCards[def.key] ??= []).push(entry);
      }
    }
  }

  return {
    colorCounts,
    creatureTypeCounts,
    themeCounts,
    keywordCounts,
    themeCards,
    creatureTypeCards,
    keywordCards,
    totalCards,
  };
}

// A commander unit is jointly "the commander" (702.124e) — every signal below
// is unioned across both cards in a pair rather than checked per-card, so a
// Partner pair matches anything either half of it would match solo.
function unitColorIdentity(unit: CommanderUnit): Set<string> {
  const set = new Set<string>();
  for (const card of unit.cards) {
    for (const c of parseJsonArray(card.color_identity)) set.add(c);
  }
  return set;
}

/**
 * The English plural of a creature type, because that is how cards refer to
 * one in the aggregate — "Elves you control", not "Elf you control". Only the
 * irregular endings Magic's type list actually contains are handled; anything
 * else takes a plain -s.
 */
function pluralOfType(type: string): string {
  // Elf -> Elves, Wolf -> Wolves, Dwarf -> Dwarves. Lathril, Blade of the
  // Elves says "ten untapped Elves you control", so missing this would drop
  // one of the most recognisable kindred commanders there is.
  if (/f$/i.test(type)) return type.replace(/f$/i, 'ves');
  // Sphinx -> Sphinxes, Fungus -> Funguses, Leech -> Leeches.
  if (/(s|x|z|ch|sh)$/i.test(type)) return `${type}es`;
  return `${type}s`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Built once per type rather than per candidate: this is tested against every
// commander unit in the pool, which runs to thousands on a real database.
const typeMentionCache = new Map<string, RegExp>();

function typeMentionPattern(type: string): RegExp {
  let pattern = typeMentionCache.get(type);
  if (!pattern) {
    pattern = new RegExp(`\\b(?:${escapeRegExp(type)}|${escapeRegExp(pluralOfType(type))})\\b`, 'i');
    typeMentionCache.set(type, pattern);
  }
  return pattern;
}

/**
 * Whether a commander unit actually *cares* about a creature type, rather
 * than merely being one.
 *
 * Sharing a type is not a reason to pick a commander. Silas Renn is a Human
 * whose text never mentions Humans; a pile of Humans in your list says
 * nothing about him. Krenko counts Goblins, Lathril taps Elves, Edgar Markov
 * triggers on Vampire spells, The First Sliver gives Sliver spells cascade —
 * in every real kindred commander the type appears in the rules text, which
 * is the difference this checks.
 *
 * Deliberately not also requiring the commander to *be* that type: Ghoulcaller
 * Gisa is a Human Wizard and one of the best Zombie commanders in the format.
 */
function caresAboutCreatureType(candidateText: string, type: string): boolean {
  return typeMentionPattern(type).test(candidateText);
}

function unitKeywords(unit: CommanderUnit): string[] {
  const set = new Set<string>();
  for (const card of unit.cards) {
    for (const k of parseJsonArray(card.keywords)) {
      if (!EXCLUDED_KEYWORDS.has(k.toLowerCase())) set.add(k);
    }
  }
  return [...set];
}

// Joined rather than checked separately: a theme pattern needs to match
// *either* card's text, and testing a regex against the concatenation gives
// exactly that without a second matchesTheme call per card.
function unitOracleText(unit: CommanderUnit): string {
  return unit.cards.map((c) => c.oracle_text ?? '').join('\n');
}

// Require at least this many *citable* cards — i.e. after narrowing to this
// specific commander's own color identity, not the whole list's global
// count — for a theme/kindred/keyword to count as a real signal. Checking the
// narrowed count rather than the global one matters: a theme can show up
// twice in the list overall but zero times among cards this commander could
// actually run, which isn't a reason to suggest it. Below this threshold, a
// signal is dropped from scoring entirely, not just hidden from the "why"
// panel — a commander scored on a signal it can't actually cite would be
// ranked on something the user can't verify.
const MIN_SIGNAL_COUNT = 3;

// A second, higher bar: a signal citing this many distinct cards is not just
// "real" (MIN_SIGNAL_COUNT) but *deep* enough to earn the bonus below. These
// are deliberately different numbers — 3 decides whether a signal is shown
// and counted at all; 5 decides whether it's strong enough to carry a
// commander on its own, per the user's own bar ("a subset of cards, I'd say
// at least 5, have an incredibly strong synergy").
const DEEP_SIGNAL_COUNT = 5;

// How much score each card beyond DEEP_SIGNAL_COUNT adds, flat — not scaled
// by density. This is the point of it: density means a deep signal on a
// 300-card list is worth almost nothing (8 supporting cards / 300 ≈
// nothing), even though 8 cards is a real deck's worth of a theme. The bonus
// is measured in the same cards the user is naming, not diluted by how big
// the rest of the list is.
const DEPTH_BONUS_PER_CARD = 1;

// Each additional signal (beyond the strongest one) is discounted by this
// factor, so a commander can no longer out-score a focused one just by
// piling up shallow matches — a wide, generic spread of themes is exactly
// what should lose to one deep, specific synergy. An infinite run of
// equal-value signals converges to 1 / (1 - factor) times a single signal's
// value, so 0.7 caps pure breadth at ~3.3x the best individual match.
const DIMINISHING_FACTOR = 0.7;

const KINDRED_WEIGHT = 15;
const THEME_WEIGHT = 10;
const KEYWORD_WEIGHT = 8;
const ARCHETYPE_WEIGHT = 20;

/**
 * Scores each candidate commander against the collection profile.
 * A candidate needs a non-zero color-identity overlap with the uploaded
 * cards AND at least one kindred, keyword, or thematic signal to be
 * suggested — this keeps the list from filling up with technically-legal
 * but meaningless matches.
 *
 * Alongside the score, each suggestion carries the cards behind every
 * signal it matched. Only cards that actually fit the commander's color
 * identity are cited, since a card you couldn't legally run under that
 * commander is not a reason to pick it.
 *
 * Scoring measures *focus*, not reach: every signal counts for the share of
 * the commander's castable pool that backs it. Color identity decides
 * which cards are eligible and nothing more — breadth of identity is what
 * lets a commander play your cards, never a reason to prefer one.
 */
export function scoreCommanders(
  units: CommanderUnit[],
  profile: CollectionProfile,
  owned: OwnedCard[]
): CommanderSuggestion[] {
  const suggestions: CommanderSuggestion[] = [];

  // Narrowed once, ahead of the loop. Every candidate is tested against this
  // list, and the pool runs to thousands of units on a real database, so
  // types that could never clear the threshold are dropped up front. The
  // global count is an upper bound on the identity-narrowed count, which
  // makes this safe to pre-filter on.
  const kindredCandidateTypes = Object.keys(profile.creatureTypeCards).filter(
    (type) => profile.creatureTypeCards[type].length >= MIN_SIGNAL_COUNT
  );

  for (const unit of units) {
    const identitySet = unitColorIdentity(unit);
    const fitsIdentity = ({ row }: OwnedCard) =>
      parseJsonArray(row.color_identity).every((c) => identitySet.has(c));

    // Two counts on purpose. includedCardCount sums quantity and is what the
    // user is shown ("Fits N cards from your list"). The density denominator
    // below counts *distinct* cards instead, so it shares units with the
    // support lists, which hold one entry per card regardless of copies.
    let includedCardCount = 0;
    let includedDistinctCount = 0;
    for (const entry of owned) {
      if (fitsIdentity(entry)) {
        includedCardCount += entry.quantity;
        includedDistinctCount += 1;
      }
    }
    if (includedCardCount === 0) continue;

    const candidateText = unitOracleText(unit);

    // Kindred is gated on the commander's own text mentioning the type, not
    // on it merely having that type on its type line. See
    // caresAboutCreatureType — being a Human is not a reason to helm a deck
    // full of them.
    const kindredSupport: KindredSupport[] = kindredCandidateTypes
      .filter((type) => caresAboutCreatureType(candidateText, type))
      .map((type) => ({
        type,
        cards: (profile.creatureTypeCards[type] ?? []).filter(fitsIdentity).map(toSupportingCard),
      }))
      .filter((k) => k.cards.length >= MIN_SIGNAL_COUNT);
    const matchedCreatureTypes = kindredSupport.map((k) => k.type);

    const keywordSupport: KeywordSupport[] = unitKeywords(unit)
      .map((keyword) => ({
        keyword,
        cards: (profile.keywordCards[keyword] ?? []).filter(fitsIdentity).map(toSupportingCard),
      }))
      .filter((k) => k.cards.length >= MIN_SIGNAL_COUNT);
    const matchedKeywords = keywordSupport.map((k) => k.keyword);

    const matchedThemeEntries = THEMES.filter((def) => matchesTheme(def, candidateText))
      .map((def) => ({
        def,
        cards: (profile.themeCards[def.key] ?? []).filter(fitsIdentity).map(toSupportingCard),
      }))
      .filter((t) => t.cards.length >= MIN_SIGNAL_COUNT);
    const matchedThemeDefs = matchedThemeEntries.map((t) => t.def);
    const matchedThemeKeys = new Set(matchedThemeDefs.map((d) => d.key));
    const themeCardsByKey = new Map(matchedThemeEntries.map((t) => [t.def.key, t.cards]));

    const matchedArchetypes = ARCHETYPES.filter(
      (arch) => arch.componentKeys.filter((k) => matchedThemeKeys.has(k)).length >= arch.minComponents
    );

    if (
      matchedCreatureTypes.length === 0 &&
      matchedThemeDefs.length === 0 &&
      matchedKeywords.length === 0 &&
      matchedArchetypes.length === 0
    ) {
      continue;
    }

    // Pulled out of themeSupport so the archetype's own card list can be
    // scored below, rather than recomputed there.
    const archetypeEntries = matchedArchetypes.map((arch) => ({
      arch,
      cards: dedupeCards(
        arch.componentKeys
          .filter((k) => matchedThemeKeys.has(k))
          .flatMap((k) => themeCardsByKey.get(k) ?? [])
      ),
    }));

    // Once an archetype fires, its component themes are the same cards under
    // a second label — e.g. Aristocrats' card list is just the union of the
    // Sacrifice and Death Triggers lists. Scoring both would pay twice for
    // one synergy. The components still appear in the "why" panel below
    // (themeSupport is built from the unfiltered matchedThemeEntries); this
    // only removes them from the score.
    const consumedThemeKeys = new Set(
      matchedArchetypes.flatMap((arch) => arch.componentKeys.filter((k) => matchedThemeKeys.has(k)))
    );
    const scoredThemeEntries = matchedThemeEntries.filter((t) => !consumedThemeKeys.has(t.def.key));

    const themeSupport: ThemeSupport[] = [
      ...archetypeEntries.map(({ arch, cards }) => ({
        key: arch.key,
        label: arch.label,
        description: arch.description,
        cards,
      })),
      ...matchedThemeEntries.map(({ def, cards }) => ({
        key: def.key,
        label: def.label,
        description: def.description,
        cards,
      })),
    ];

    const gameChangerCards = owned
      .filter((entry) => entry.row.game_changer && fitsIdentity(entry))
      .map(toSupportingCard);

    // Each signal is worth how much of the *castable* pool stands behind it,
    // not how many cards these colors happen to permit. A commander whose
    // every playable card feeds one theme fits better than one that can play
    // everything and half-supports the same theme.
    //
    // Color identity therefore only decides which cards count (above) and
    // scores nothing by itself. It used to contribute the single largest
    // term — a five-color commander banked all of it for free, taking a
    // fixed lead over any focused commander before synergy was looked at.
    const pool = Math.max(includedDistinctCount, 1);
    const density = (supporting: number) => supporting / pool;

    // One list of every signal this commander earned, each carrying both its
    // density-weighted value (for breadth, below) and its raw card count
    // (for depth, below) — the two terms deliberately read different numbers
    // off the same signal rather than sharing one.
    const signals = [
      ...kindredSupport.map((t) => ({ cardCount: t.cards.length, rawScore: density(t.cards.length) * KINDRED_WEIGHT })),
      ...scoredThemeEntries.map((t) => ({ cardCount: t.cards.length, rawScore: density(t.cards.length) * THEME_WEIGHT })),
      ...keywordSupport.map((k) => ({ cardCount: k.cards.length, rawScore: density(k.cards.length) * KEYWORD_WEIGHT })),
      ...archetypeEntries.map((a) => ({ cardCount: a.cards.length, rawScore: density(a.cards.length) * ARCHETYPE_WEIGHT })),
    ];

    // Breadth: every signal still contributes, but each one past the
    // strongest is worth less than the last (DIMINISHING_FACTOR per rank).
    // A commander can no longer out-score a focused one purely by matching
    // more themes at low density each.
    const breadthScore = signals
      .map((s) => s.rawScore)
      .sort((a, b) => b - a)
      .reduce((sum, rawScore, rank) => sum + rawScore * DIMINISHING_FACTOR ** rank, 0);

    // Depth: a signal citing DEEP_SIGNAL_COUNT or more distinct cards earns a
    // flat bonus per card beyond that floor. Unlike density this is never
    // diluted by the rest of the list, so a genuinely deep synergy — the
    // user's own bar of "at least 5 cards" — can outweigh a commander that
    // only spreads thin across many signals.
    const depthScore = signals.reduce(
      (sum, s) => sum + Math.max(0, s.cardCount - DEEP_SIGNAL_COUNT + 1) * DEPTH_BONUS_PER_CARD,
      0
    );

    const score = breadthScore + depthScore;

    suggestions.push({
      cards: unit.cards,
      score,
      matchedThemes: [...matchedArchetypes.map((a) => a.label), ...matchedThemeDefs.map((t) => t.label)],
      matchedCreatureTypes,
      matchedKeywords,
      includedCardCount,
      themeSupport,
      kindredSupport,
      keywordSupport,
      gameChangerCards,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}
