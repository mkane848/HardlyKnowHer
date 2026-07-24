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

export interface CommanderSuggestionDTO {
  oracleId: string;
  name: string;
  imageUri: string | null;
  colorIdentity: string[];
  typeLine: string | null;
  oracleText: string | null;
  score: number;
  matchedThemes: string[];
  matchedCreatureTypes: string[];
  includedCardCount: number;
  themeSupport: ThemeSupportDTO[];
  tribeSupport: TribeSupportDTO[];
  gameChangerCards: SupportingCardDTO[];
  gameChangerCount: number;
  isGameChanger: boolean;
  bracket: BracketEstimateDTO;
}

export interface RecommendResponse {
  totalParsed: number;
  totalMatched: number;
  notFound: string[];
  suggestions: CommanderSuggestionDTO[];
}
