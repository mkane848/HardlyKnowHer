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
  imageUri: string | null;
  scryfallUri: string | null;
}

/** A command-zone pairing mechanic: Partner, Choose a Background, etc. */
export interface PairingDTO {
  kind: string;
  /** The card named by "Partner with", or the "Partner — X" group label. */
  label: string | null;
  /** Display name of the mechanic, e.g. "Choose a Background". */
  mechanicName: string;
}

/** A legal second commander, and what pairing with it would unlock. */
export interface PartnerOptionDTO {
  oracleId: string;
  name: string;
  imageUri: string | null;
  scryfallUri: string | null;
  typeLine: string | null;
  manaCost: string | null;
  colorIdentity: string[];
  mechanic: string;
  combinedIdentity: string[];
  combinedCardCount: number;
  addedCardCount: number;
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
  manaCost: string | null;
  manaValue: number | null;
  power: string | null;
  toughness: string | null;
  scryfallUri: string | null;
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
  /** Non-null when this commander can share the command zone with another card. */
  pairing: PairingDTO | null;
  partnerOptions: PartnerOptionDTO[];
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
