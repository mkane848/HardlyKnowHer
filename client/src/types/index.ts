export interface BracketEstimateDTO {
  label: string;
  range: string;
  note: string;
}

export interface CommanderSuggestionDTO {
  oracleId: string;
  name: string;
  imageUri: string | null;
  colorIdentity: string[];
  typeLine: string | null;
  score: number;
  matchedThemes: string[];
  matchedCreatureTypes: string[];
  includedCardCount: number;
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
