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
}

/** A theme (or archetype — see ARCHETYPES below) the commander shares with the list. */
export interface ThemeSupport {
  key: string;
  label: string;
  description: string;
  cards: SupportingCard[];
}

/** A creature type the commander shares with the list. */
export interface TribeSupport {
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
  tribeSupport: TribeSupport[];
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
  theme('sacrifice', 'Sacrifice', 'Cards that sacrifice creatures or other permanents for value.', /sacrifice/i),
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
  theme('draw', 'Card Draw', 'Cards that refill your hand.', /draw (a|two|three|\d+) cards?/i),
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

function unitCreatureTypes(unit: CommanderUnit): string[] {
  const set = new Set<string>();
  for (const card of unit.cards) {
    for (const t of parseJsonArray(card.creature_types)) set.add(t);
  }
  return [...set];
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

const MIN_SIGNAL_COUNT = 2; // require a theme/tribe/keyword to show up at least twice to count as a real signal

/**
 * Scores each candidate commander against the collection profile.
 * A candidate needs a non-zero color-identity overlap with the uploaded
 * cards AND at least one tribal, keyword, or thematic signal to be
 * suggested — this keeps the list from filling up with technically-legal
 * but meaningless matches.
 *
 * Alongside the score, each suggestion carries the cards behind every
 * signal it matched. Only cards that actually fit the commander's colour
 * identity are cited, since a card you couldn't legally run under that
 * commander is not a reason to pick it.
 */
export function scoreCommanders(
  units: CommanderUnit[],
  profile: CollectionProfile,
  owned: OwnedCard[]
): CommanderSuggestion[] {
  const suggestions: CommanderSuggestion[] = [];

  for (const unit of units) {
    const identitySet = unitColorIdentity(unit);
    const fitsIdentity = ({ row }: OwnedCard) =>
      parseJsonArray(row.color_identity).every((c) => identitySet.has(c));

    let includedCardCount = 0;
    for (const entry of owned) {
      if (fitsIdentity(entry)) includedCardCount += entry.quantity;
    }
    if (includedCardCount === 0) continue;

    const candidateTypes = unitCreatureTypes(unit);
    const matchedCreatureTypes = candidateTypes.filter(
      (t) => (profile.creatureTypeCounts[t] ?? 0) >= MIN_SIGNAL_COUNT
    );

    const candidateKeywords = unitKeywords(unit);
    const matchedKeywords = candidateKeywords.filter(
      (k) => (profile.keywordCounts[k] ?? 0) >= MIN_SIGNAL_COUNT
    );

    const candidateText = unitOracleText(unit);
    const matchedThemeDefs = THEMES.filter(
      (def) => (profile.themeCounts[def.key] ?? 0) >= MIN_SIGNAL_COUNT && matchesTheme(def, candidateText)
    );
    const matchedThemeKeys = new Set(matchedThemeDefs.map((d) => d.key));

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

    const themeSupport: ThemeSupport[] = [
      ...matchedArchetypes.map((arch) => ({
        key: arch.key,
        label: arch.label,
        description: arch.description,
        cards: dedupeCards(
          arch.componentKeys
            .filter((k) => matchedThemeKeys.has(k))
            .flatMap((k) => (profile.themeCards[k] ?? []).filter(fitsIdentity).map(toSupportingCard))
        ),
      })),
      ...matchedThemeDefs.map((def) => ({
        key: def.key,
        label: def.label,
        description: def.description,
        cards: (profile.themeCards[def.key] ?? []).filter(fitsIdentity).map(toSupportingCard),
      })),
    ];

    const tribeSupport: TribeSupport[] = matchedCreatureTypes.map((type) => ({
      type,
      cards: (profile.creatureTypeCards[type] ?? []).filter(fitsIdentity).map(toSupportingCard),
    }));

    const keywordSupport: KeywordSupport[] = matchedKeywords.map((keyword) => ({
      keyword,
      cards: (profile.keywordCards[keyword] ?? []).filter(fitsIdentity).map(toSupportingCard),
    }));

    const gameChangerCards = owned
      .filter((entry) => entry.row.game_changer && fitsIdentity(entry))
      .map(toSupportingCard);

    const coverageRatio = includedCardCount / Math.max(profile.totalCards, 1);
    const score =
      coverageRatio * 50 +
      matchedCreatureTypes.length * 15 +
      matchedThemeDefs.length * 10 +
      matchedKeywords.length * 8 +
      matchedArchetypes.length * 20;

    suggestions.push({
      cards: unit.cards,
      score,
      matchedThemes: [...matchedArchetypes.map((a) => a.label), ...matchedThemeDefs.map((t) => t.label)],
      matchedCreatureTypes,
      matchedKeywords,
      includedCardCount,
      themeSupport,
      tribeSupport,
      keywordSupport,
      gameChangerCards,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}
