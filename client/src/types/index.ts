export interface BracketEstimateDTO {
  label: string;
  range: string;
  note: string;
}

/** One of your cards, cited as a reason a commander was suggested. */
export interface SupportingCardDTO {
  name: string;
  quantity: number;
  typeLine: string | null;
  isGameChanger: boolean;
  manaValue: number | null;
  imageUri: string | null;
  /** Second face of a transform/modal DFC, for the art preview's flip control. */
  backImageUri: string | null;
  backName: string | null;
  scryfallUri: string | null;
}

export interface ThemeSupportDTO {
  key: string;
  label: string;
  description: string;
  cards: SupportingCardDTO[];
}

export interface KindredSupportDTO {
  type: string;
  cards: SupportingCardDTO[];
}

export interface KeywordSupportDTO {
  keyword: string;
  cards: SupportingCardDTO[];
}

/** One card of a commander unit — a solo commander has one, a Partner/Background pair has two. */
export interface CommanderCardDTO {
  oracleId: string;
  name: string;
  imageUri: string | null;
  /** Second face of a transform/modal DFC — null for single-faced cards. */
  backImageUri: string | null;
  backName: string | null;
  colorIdentity: string[];
  typeLine: string | null;
  oracleText: string | null;
  manaCost: string | null;
  manaValue: number | null;
  power: string | null;
  toughness: string | null;
  scryfallUri: string | null;
  isGameChanger: boolean;
}

export interface CommanderSuggestionDTO {
  /** Stable id for the unit (both cards' oracle ids, sorted and joined) — use this, not a card's own oracleId, as the row key. */
  unitId: string;
  cards: CommanderCardDTO[];
  colorIdentity: string[];
  score: number;
  matchedThemes: string[];
  matchedCreatureTypes: string[];
  matchedKeywords: string[];
  includedCardCount: number;
  themeSupport: ThemeSupportDTO[];
  kindredSupport: KindredSupportDTO[];
  keywordSupport: KeywordSupportDTO[];
  gameChangerCards: SupportingCardDTO[];
  gameChangerCount: number;
  bracket: BracketEstimateDTO;
}

export interface ComboDTO {
  id: string | null;
  permalink: string | null;
  cards: string[];
  produces: string[];
  description: string | null;
  /** Pieces you don't have. Empty for combos you can already assemble. */
  missing: string[];
}

export interface ComboLookupResponse {
  ready: ComboDTO[];
  almost: ComboDTO[];
  cached: boolean;
  searchedCardCount: number;
}

export interface RecommendResponse {
  totalParsed: number;
  totalMatched: number;
  /** Copies dropped because Commander is singleton — see services/singleton.ts. */
  ignoredCopies: number;
  notFound: string[];
  suggestions: CommanderSuggestionDTO[];
}
