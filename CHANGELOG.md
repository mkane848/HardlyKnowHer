# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and version numbers follow [Semantic Versioning](https://semver.org/):
`MAJOR.MINOR.PATCH`, where MAJOR is a breaking change to how the app is used,
MINOR is a new capability, and PATCH is a fix with no new capability.

## [Unreleased]

### Added

- No cap on how many commanders can be suggested — every candidate that
  clears the matching bar comes back, not just the top 30. How many show
  per page is now yours to set via a "Show" control next to Sort, and the
  choice is remembered for next time.
- Each cited card's name in "Why this commander?" shows its art on hover
  (or on tap, on a touch screen) without leaving the list, and its mana
  value alongside the name.
- Commander Spellbook combo results — "Ready to go" and "Almost there" —
  now page independently instead of listing everything found at once, with
  their own "Show N per page" control. The whole results block can be
  collapsed back down after fetching without losing what was found;
  reopening it doesn't ask Commander Spellbook again.

### Fixed

- The Sacrifice theme required only the bare word "sacrifice" anywhere in a
  card's text, so every fetch land in the format counted toward
  creature-sacrifice synergy — a fetch land's own text reads "Sacrifice
  Arid Mesa: …", sacrificing only itself, by name, as the cost for an
  unrelated effect. The pattern now requires an indefinite object right
  after the word ("sacrifice **a** creature", "sacrifice **another**
  artifact", "sacrifice **it**"), which a self-referential cost never has.
- "Card Draw" is no longer detected as its own theme. Almost every deck
  draws cards somehow, so it was adding a "Themes: Card Draw" tag to
  nearly anything capable of drawing one rather than pointing at an actual
  pattern in the list.

## [1.3.0] — 2026-07-27

### Added

- The About dialog now shows when the app was last updated, alongside the
  version number. Taken from the build's commit date, not hand-maintained,
  so it can't go stale the way a manually-typed date would.

### Changed

- A creature type now only counts if the commander's own rules text cares
  about it. Sharing a type was enough before, so a list with eight Humans
  in it collected a "Human" tag on every commander that happened to be a
  Human, whether or not it did anything with them. Krenko counting
  Goblins, Lathril tapping Elves, and Edgar Markov triggering on Vampire
  spells all still match; Silas Renn, whose text never mentions Humans,
  no longer does. A commander need not *be* the type it cares about —
  Ghoulcaller Gisa is a Human Wizard and one of the best Zombie
  commanders there is. Irregular plurals are handled, since Lathril's
  text says "Elves", never "Elf".
- "Tribal" is now "Kindred" throughout, matching the current wording on
  cards.
- Both halves of a Partner/Background pair are named together in one
  heading. Each face used to render its own full title, so the second
  name sat below a type line and a whole rules-text box and reading
  "which two cards is this?" meant scanning the length of the card.
- The colour filter's hint no longer says "require". Including White does
  not require white — it permits it, and a commander shows when its whole
  colour identity fits inside the colours you allowed, which is why
  allowing White and Black still lists mono-black commanders. Brackets and
  themes genuinely do require, and keep their original wording.
- Each group inside "Why this commander?" — every kindred type, theme, keyword,
  and the Game Changers list — is now collapsible and starts collapsed.
  Expanding the panel used to unroll every supporting card at once, which
  pushed the page out far enough that the themes themselves were hard to
  take in. The reasoning now opens as a short list of headings with their
  counts, and any one group opens on click.

## [1.2.1] — 2026-07-27

### Fixed

- Colour identity no longer scores anything by itself. It used to open the
  formula with `coverageRatio * 50` — the largest single term — which a
  five-colour commander banked in full for free, so it could out-rank a
  mono-colour commander that matched your list twice as well before any
  synergy was weighed. Identity now only decides which cards are eligible
  to count.
- Signals are scored by density instead of a flat count: each tribe, theme,
  keyword, and archetype is worth the share of that commander's playable
  cards standing behind it. A signal every playable card supports is worth
  its full weight; one that half of them support is worth half. Scoring
  now rewards a focused fit rather than colour reach, and a deep theme no
  longer counts the same as one scraping the three-card minimum.

## [1.2.0] — 2026-07-26

### Changed

- Submitted lists are now read as a legal Commander deck rather than as a
  pile of cards: extra copies beyond what the singleton rule (903.5b)
  allows are ignored when scoring. Basic lands, "any number of cards
  named …" cards, and "up to N cards named …" cards keep their copies, all
  read off the card's own text and type line. Repeats of one card spread
  across several lines are merged first, so a card listed three times can
  no longer pass for three different cards supporting a theme. Anything
  trimmed is reported as "N extra copies ignored" beside the matched
  count.
- A theme, tribe, or keyword now needs at least **three** supporting cards
  to count, measured after narrowing to that commander's own colour
  identity. Below that it is dropped from the recommendation engine
  entirely, not just hidden — it no longer contributes to a commander's
  score, and no longer appears in "Why this commander?". A group of one or
  two cards is noise, and scoring on it ranked commanders on evidence too
  thin to check.
- Result filters are now include/exclude rather than include-only: tap a
  chip once to require it, again to exclude it, again to clear it. This
  applies to colours, Colorless/Multicolor, Brackets, and themes alike.
- Colorless and Multicolor moved out of their own row and into the Colors
  row alongside the WUBRG pips, since they describe a colour identity too.

### Added

- Each suggestion shows a match score relative to the best match currently
  on screen, with a hover/tap tooltip breaking down what drove it.

### Removed

- `@radix-ui/react-toggle-group`, now unused — the filter chips need a
  three-state cycle that a toggle group does not model.

## [1.1.0] — 2026-07-26

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
- Layout now keeps clear of notches, the home indicator, and a sliding
  mobile URL bar on phones.

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

[Unreleased]: https://github.com/mkane848/HardlyKnowHer/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/mkane848/HardlyKnowHer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mkane848/HardlyKnowHer/releases/tag/v1.0.0
