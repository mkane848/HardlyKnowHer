# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and version numbers follow [Semantic Versioning](https://semver.org/):
`MAJOR.MINOR.PATCH`, where MAJOR is a breaking change to how the app is used,
MINOR is a new capability, and PATCH is a fix with no new capability.

## [Unreleased]

### Added

- Partner, Partner—[text], Partner with [Name], Friends forever, Choose a
  Background, and Doctor's companion are now recognized: a commander with
  one of these abilities appears both as a solo suggestion and as one
  suggestion per valid pairing, on the same ranked list.
- A non-functional "EDHRec" placeholder button next to "Find combos" on
  each suggestion, reserving the spot for a future one-time lookup. No
  EDHREC data is fetched.
- Whole-card art preview: tapping a commander's image, or any supporting
  card cited in a "Why this commander?" explanation, opens that card at
  its own proportions.
- A sort control (best match, or colour/name/mana value) alongside the
  existing filters.
- "Copy list" and "Download .txt" export the current suggestion list.
- Suggestion tags and filter options (Tribal/Themes/Keywords, and the
  filter bar's theme chips) now only count a theme or tribe if it still
  has supporting cards after narrowing to that commander's colour
  identity, rather than showing one with nothing behind it.

## [1.0.0] — 2026-07-26

First versioned release. This project had been under active development
without version numbers before this point; this entry covers the app as it
stands today, not a chronological history of how it got here.

### Added

- Paste or upload a card list; get back legal Commander suggestions scored
  against it, each with an estimated power Bracket.
- Deck-list parsing for the formats real sites export: Moxfield, Archidekt,
  TCGplayer Mass Entry, Arena, and MTGO, including quantities, set codes in
  either bracket style, foil/commander markers, and MTGO's `SB:` prefix.
- Double-faced cards match on either face's name alone, not just the full
  combined name.
- A "Why this commander?" explanation for every suggestion: which of your
  cards support it and why, not just a score.
- Synergy detection across shared creature types, shared keywords (e.g. a
  Flying-heavy list), named archetypes (Aristocrats, Voltron, Spellslinger),
  and a set of hand-picked themes (sacrifice, graveyard, tokens, artifacts,
  enchantments, planeswalkers, doublers/multipliers, and more).
- Commander Spellbook combo lookup, run only when you explicitly ask for it
  on a suggestion — never automatically.
- Filtering by color (with proper subset matching — picking Black and Green
  shows what you could actually build in Golgari), by Colorless or
  Multicolor, by Bracket, and by theme; pagination; and per-suggestion
  dismissal.
- A full card-detail view (art, mana cost, complete rules text,
  power/toughness, Scryfall link) for any suggestion whose text doesn't fit
  on the card face.
- Real MTG presentation conventions: WUBRG color ordering, named color
  identities (Dimir, Golgari, Boros, ...), and mana symbols.
- A collapsible card-list panel that tucks itself away once results load.
- An About panel (this app, in the navbar) with version info, data-source
  credits, and a link to the repository.

### Notes

- Card and legality data comes from [Scryfall](https://scryfall.com)'s bulk
  data, re-imported on every deploy.
- Combo data comes from [Commander Spellbook](https://commanderspellbook.com),
  queried live and only on request.
- Bracket estimates are a heuristic based on Game Changer count, not the full
  official Bracket System — they don't model combo speed, mass land
  destruction, or extra-turn density.

[Unreleased]: https://github.com/mkane848/HardlyKnowHer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/mkane848/HardlyKnowHer/releases/tag/v1.0.0
