import type { CommanderSuggestionDTO, SupportingCardDTO } from '../src/types';

/** A supporting card, for tests that only care about its name/quantity. */
export function makeSupportingCard(overrides: Partial<SupportingCardDTO> = {}): SupportingCardDTO {
  return {
    name: 'Fake Card',
    quantity: 1,
    typeLine: null,
    isGameChanger: false,
    imageUri: null,
    scryfallUri: null,
    ...overrides,
  };
}

/** A minimally-filled suggestion, so each test only has to spell out the
 * fields it actually cares about. */
export function makeSuggestion(overrides: Partial<CommanderSuggestionDTO> = {}): CommanderSuggestionDTO {
  return {
    oracleId: overrides.name ?? 'oracle-id',
    name: 'Test Commander',
    imageUri: null,
    colorIdentity: [],
    typeLine: null,
    oracleText: null,
    manaCost: null,
    manaValue: 0,
    power: null,
    toughness: null,
    scryfallUri: null,
    score: 0,
    matchedThemes: [],
    matchedCreatureTypes: [],
    includedCardCount: 0,
    themeSupport: [],
    tribeSupport: [],
    gameChangerCards: [],
    gameChangerCount: 0,
    isGameChanger: false,
    bracket: { label: 'Exhibition / Core', range: 'Bracket 1–2', note: '' },
    pairing: null,
    partnerOptions: [],
    ...overrides,
  };
}
