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
}

export interface ThemeSupportDTO {
  key: string;
  label: string;
  description: string;
  cards: SupportingCardDTO[];
}

export interface TribeSupportDTO {
  type: string;
  cards: SupportingCardDTO[];
}

export interface KeywordSupportDTO {
  keyword: string;
  cards: SupportingCardDTO[];
}

export interface CommanderSuggestionDTO {
  oracleId: string;
  name: string;
  imageUri: string | null;
  colorIdentity: string[];
  typeLine: string | null;
  oracleText: string | null;
  manaCost: string | null;
  power: string | null;
  toughness: string | null;
  scryfallUri: string | null;
  score: number;
  matchedThemes: string[];
  matchedCreatureTypes: string[];
  matchedKeywords: string[];
  includedCardCount: number;
  themeSupport: ThemeSupportDTO[];
  tribeSupport: TribeSupportDTO[];
  keywordSupport: KeywordSupportDTO[];
  gameChangerCards: SupportingCardDTO[];
  gameChangerCount: number;
  isGameChanger: boolean;
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
  notFound: string[];
  suggestions: CommanderSuggestionDTO[];
}
