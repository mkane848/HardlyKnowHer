# Handoff: Commander Recommender

A personal/hobby project (not work-related) — keep solutions simple and
maintainable for a solo developer. This document exists so a fresh agent
session (e.g. Claude Code) has full context without re-deriving decisions
already made in the design conversation.

## What this is

A web app: upload a list of Magic: The Gathering cards, and it recommends
legal Commanders based on synergies found within that list (or subsets of
it). Every suggestion is checked against the current Commander ban list and
tagged with an estimated power Bracket (1–5, per Wizards' Bracket System).

## Status at handoff — read this first

**Nothing in this project has actually been run yet.** It was built in a
sandboxed environment with no network access, so:

- `npm install` has never been run (no `node_modules` anywhere)
- The Scryfall card data has never been downloaded or imported — `server/data/`
  is empty except a `.gitkeep`
- The app has never been started; client and server have never talked to
  each other
- The Render deployment has never been exercised

What *has* been done: every `.ts`/`.tsx` file was checked with `tsc --noEmit`
in isolation and came back clean (the only errors were the expected "cannot
find module" noise from uninstalled dependencies — no logic/syntax errors).
That's a much weaker guarantee than actually running it.

### Immediate next steps

1. `npm install` at the repo root, then `npm run install:all` (installs
   `server/` and `client/` separately). Watch for `better-sqlite3` failing to
   fetch/build its native binary — see "Known risk areas" below.
2. Get card data: `cd server && npm run prepare-data` (fetches the current
   Scryfall Oracle Cards bulk file and imports it into SQLite). Needs
   network; takes a few minutes.
3. `npm run dev` at the root. Confirm the server comes up on `:4000` and the
   client on `:5173`, and that `http://localhost:5173` loads.
4. Paste a real decklist in and confirm you get back sane-looking Commander
   suggestions, not just that the request succeeds.
5. Fix whatever breaks — this is the first real execution of this code, so
   treat it as unverified until step 4 passes.

## Tech stack & why

All explicitly requested by the user unless noted:

- **Vite + React + TypeScript** (client)
- **MTG presentation conventions** live in `client/src/lib/mtg.ts`: colours are
  always shown in WUBRG order (never alphabetical, never raw data order), and
  a colour identity is named — "Golgari", not "Black/Green" — because that's
  what players read. Symbols are the real mana glyphs, inlined as SVG paths in
  `lib/manaSymbols.ts` and drawn by `components/ManaSymbol.tsx`.
  These came from the `mana-font` package (MIT), but **the package itself is
  deliberately not a dependency**: its stylesheet offers no woff2, so a
  browser downloads a ~408KB `.woff` plus an unused body-text face to render
  six pips. Six inlined paths cost ~12KB of markup instead. Don't "simplify"
  this back to the font without re-checking that trade.

- **Radix UI** for interactive controls that need real keyboard and
  screen-reader behaviour (the filter toggle groups). TanStack has no
  equivalent — it ships data and interaction *logic*, not accessible UI
  primitives — so the two are used side by side rather than one instead of
  the other.

- **Zustand + TanStack Query** for state, split by what the state *is*:
  Zustand (`client/src/store/useAppStore.ts`) holds client state only — the
  textarea contents and the list that was actually submitted — and is where a
  user session would go once there are accounts. Everything fetched lives in
  Query (`client/src/api/queries.ts`), which owns its caching and
  loading/error state. Recommendations are modelled as a *query* keyed on the
  submitted list, not a mutation: the POST is only because a deck list is too
  big for a query string, and nothing changes server-side. That keying is why
  the form and the results section can read the same data without passing
  anything between them.
  **The defaults in `main.tsx` are load-bearing.** Query retries failed
  queries three times and refetches on window focus out of the box; against
  Commander Spellbook that would mean more traffic than the hand-rolled
  version sent. `retry`, `refetchOnWindowFocus` and `refetchOnReconnect` are
  all off deliberately — don't restore them without thinking about who is
  being called.
- **Express + TypeScript + better-sqlite3** (server) — user chose this over
  a fully client-side/WASM-SQLite approach when offered the choice, wanting
  a more conventional setup with easier persistence.
- **CommonJS**, not ESM, on the server — avoids Node ESM's relative-import
  `.js`-extension requirement, which is unnecessary friction for a solo
  hobby project.
- **Scryfall bulk data**, not EDHREC — explicit user requirement ("do not
  scrape the EDHREC API"). Scryfall's official "Oracle Cards" JSON export
  already includes `legalities.commander` (legal/banned/not_legal) and a
  `game_changer` boolean per card, so the ban list and Game Changers list
  don't need to be hand-maintained anywhere in this codebase — just re-import
  periodically to stay current.

### A deliberate architectural point worth preserving

There are no user accounts and no saved uploads — recommendations are
computed fresh per request from whatever list is pasted in. That means the
SQLite database is effectively **static read-only reference data**, not
app state. This is why the Render deploy rebuilds it from scratch on every
deploy instead of using a persistent disk (see `DEPLOY.md`) — don't
"fix" that into a persistent-disk setup without remembering why it's this
way.

## File map

This map is meant to stay current — update it in the same commit whenever
you add or rename a file here, rather than letting it drift like it did for
most of this project's early history.

```
package.json          root convenience script (npm run dev via concurrently); canonical app version
render.yaml            Render Blueprint — provisions both services
README.md              setup + usage instructions for a human
DEPLOY.md              Render deployment walkthrough
CHANGELOG.md            Keep a Changelog + SemVer — bump this and the version together

client/                Vite + React + TS + Zustand + TanStack Query
  vite.config.ts         dev-server proxy: /api -> localhost:4000; injects __APP_VERSION__
  .env.example            documents VITE_API_URL (blank in dev)
  src/
    main.tsx, App.tsx     entry point / page shell / navbar
    index.css              design system: parchment/ink palette, mana pips
    store/useAppStore.ts   client state only: rawList, submittedList, dismissed
    api/
      client.ts             fetchRecommendations/fetchCombos, wakeServer, cold-start retry
      queries.ts             TanStack Query hooks wrapping the above
    lib/
      mtg.ts                 WUBRG ordering, colour-identity naming (Dimir, Golgari, ...)
      filters.ts              SuggestionFilters + matching logic (color/category/bracket/theme)
      manaSymbols.ts           inlined SVG path data for the 6 mana glyphs
    types/index.ts          DTOs mirroring the server's response shape — a suggestion is
                             `{ unitId, cards: CommanderCardDTO[], colorIdentity, ... }`, one-or-two
                             cards per unit, not a single flattened card
    components/
      CardListUpload.tsx        paste or upload .txt, submit; collapses after a load succeeds
      RecommendationResults.tsx  filter bar + paginated suggestion grid
      ResultFilters.tsx          color/color-category/bracket/theme filter controls
      CommanderCard.tsx          one suggestion: pips, one `CommanderFace` per card (1 or 2),
                                  "why" disclosure
      CardDetailDialog.tsx        full-card modal for one card of a unit (art, mana cost, full
                                   text, Scryfall link); takes `card` + the unit's shared `bracket`
      ManaSymbol.tsx, ManaCost.tsx  render mana pips / a full cost string
      ComboFinder.tsx             click-to-run Commander Spellbook lookup inside a suggestion;
                                   takes `commanderNames: string[]` (1 or 2) for pair support
      AboutDialog.tsx             version, credits, repo link

server/                Express + TS + better-sqlite3
  src/
    index.ts               app entry; CORS via optional CLIENT_ORIGIN env var
    db.ts                   SQLite connection; findCardsByNames (incl. DFC face-name fallback),
                             getCommanderCandidates, getBackgroundCards (legal legendary Backgrounds)
    types.ts                CardRow shape (mirrors the cards table), incl. partner_ability/
                             partner_target/is_background (rule 702.124)
    routes/
      recommend.ts            POST /api/recommend
      combos.ts                POST /api/combos — proxies to Commander Spellbook, on request only;
                                takes `commanderNames: string[]` (1-2) for a Partner unit
    services/
      parseList.ts            decklist text -> [{name, quantity}]; handles the major export formats
      partners.ts              builds every legal `CommanderUnit` (solo + Partner-family pairs)
                                from the candidate pool — see "Partner/Background" below
      synergy.ts               profile-building + commander scoring (the core logic), operating on
                                `CommanderUnit`s (1-2 cards), not single cards
      bracket.ts               Game-Changer-count -> Bracket estimate
      spellbook.ts             Commander Spellbook adapter: cache, backoff, response normalisation
  scripts/
    fetch-scryfall.ts        downloads current Oracle Cards bulk file (skips if a recent copy exists)
    import-scryfall.ts       parses that file into server/data/cards.sqlite + card_face_names;
                             also detects Partner-family abilities and Background enchantments
                             (rule 702.124) from oracle text
    test-parse-list.ts        npm test — parser cases (node:assert via tsx)
    test-spellbook.ts          npm test — Spellbook adapter cases, against a local mock
  data/                     gitignored; oracle-cards.json + cards.sqlite live here
```

## Core logic, summarized (read the files for full detail)

- **`parseList.ts`** — regex-based parser. Handles bare names, `1 Sol Ring`,
  `1x`/`1 x` quantities, and strips whatever export metadata trails the name:
  `(SET) 263` and `[SET] 84` set codes (Moxfield/Arena/MTGO use parentheses,
  TCGplayer Mass Entry uses square brackets), `*F*`/`*CMDR*` markers,
  Archidekt `[Category]` tags and `^Label,#hex^` colour labels, and
  spelled-out set names like `(Commander 2021)`. Because sites combine these
  in different orders, the stripping runs in a loop rather than as one
  anchored regex — that ordering assumption is what made the original version
  miss every Archidekt and TCGplayer line. Skips blank lines, `//`/`#`
  comments, zone headers and `Creature (12)` grouping headers.
  `npm test` (`scripts/test-parse-list.ts`, node:assert via tsx, no test
  framework) covers each format; run it if you touch this file.

- **`spellbook.ts` + `routes/combos.ts`** — Commander Spellbook lookup, used
  by the "Find combos" button inside a suggestion's expanded details. It runs
  **only on an explicit click** — never on page load, on a timer, or as part
  of a recommendation — and hits `find-my-combos`, the endpoint they built for
  this exact question, rather than crawling their whole database. Answers are
  cached in memory for an hour, keyed on commander + card set, so repeat
  clicks cost them nothing; a 429 is surfaced with their `Retry-After` and
  **not** retried. Keep those properties if you touch this: the polite
  behaviour is the reason it's acceptable to call them at all.
  **The live request/response contract is unverified.** Their API shape isn't
  in any public doc I could reach, so the adapter normalises defensively
  (`{card:{name}}`, `{card}` and plain strings all work) and
  `scripts/test-spellbook.ts` pins the behaviour against a local mock built
  from a best reading of their API. If real responses come back empty, the
  field mapping in `normalizeVariant` is the first thing to check.

- **`partners.ts`** — builds every legal `CommanderUnit` (rule 702.124: a
  commander as actually played, one card or two) from the eligible candidate
  pool: one solo unit per candidate, plus one pair per valid Partner,
  Partner—[text], Partner with [Name], Friends forever, Choose a Background,
  or Doctor's companion combination. A card with a partner ability still gets
  its own solo unit too — every variant is optional, so e.g. a Partner card
  is a perfectly legal commander by itself, and both the solo and every valid
  pairing show up as separate entries on the same ranked suggestion list
  (not a separate section, and not precomputed — this runs fresh per
  request). Pairing is grouped by ability variant rather than a blind
  cross-product over the whole pool (different variants never combine with
  each other per 702.124f), which keeps it cheap enough to run per request
  with an eligible pool in the tens to low hundreds. `Partner with [Name]` is
  checked for symmetric naming (each card must name the other, not just be
  named by it); Doctor's companion is checked for an *exact* {Time Lord,
  Doctor} creature-type set, not just "has those types among others."

- **`synergy.ts`** — the heart of the app.
  1. Builds a `CollectionProfile` from the matched cards: color-identity
     counts, creature-type counts, keyword counts (from Scryfall's
     `keywords` field — e.g. a Flying-heavy list), and counts against a set
     of hand-picked oracle-text theme regexes (sacrifice, graveyard,
     +1/+1 counters, tokens, artifacts, enchantments, planeswalkers,
     equipment, auras, spellslinger, lifegain, draw, mill, death triggers,
     landfall, reanimation, doublers/multipliers).
  2. `ARCHETYPES` is a second layer on top of the theme list: a named label
     (Aristocrats, Voltron) for a *combination* of themes, applied when a
     candidate matches enough of the archetype's component theme keys.
     Spellslinger is **not** in this layer — it's just the existing
     `spellslinger` theme under its real name, since that already was the
     archetype under a blander label; adding a parallel archetype for it
     would just duplicate the same detection twice.
  3. Scores every `CommanderUnit` from `partners.ts` (not a single `CardRow`
     — see above): requires nonzero color-identity overlap AND at least one
     tribal/theme/keyword/archetype signal (signal threshold: appears ≥2
     times in the list) to even be considered. Every signal is unioned
     across both cards in a pair (`unitColorIdentity`/`unitCreatureTypes`/
     `unitKeywords`/`unitOracleText`) per rule 702.124e — a Partner pair
     matches anything either half of it would match solo, and its combined
     color identity is the union, not the intersection. Score =
     `coverageRatio * 50 + tribalMatches * 15 + themeMatches * 10 +
     keywordMatches * 8 + archetypeMatches * 20`.
  - Partner-family keywords (Partner, Partner with, Friends forever, Choose
    a Background, Doctor's companion) are excluded from the shared-keyword
    signal on purpose — they mean something structural about who can be
    your commander, not a thematic pattern, and showing "Partner" as a
    generic shared-keyword tag would read as a confused echo of the
    dedicated Partner/Background handling in `partners.ts`, not a second,
    unrelated theme.
  - Every signal here requires the *candidate's own text* to match too, not
    just the profile. This is consistent but has a real cost for Voltron
    specifically: a commander that's a great Voltron target purely on
    stats (evasive, hard to remove) but whose own text never says
    "equip"/"enchant"/"Aura" won't be flagged. Documented in the archetype's
    own description string, not hidden.
  - This is intentionally a short, readable heuristic, not a combo/archetype
    *engine* — documented as a known limitation, not a bug to silently "fix"
    into something more complex without discussing it first.

- **`bracket.ts`** — Bracket estimate is based *only* on Game Changer count
  among matched cards + the suggested commander itself: 0 → "Bracket 1–2",
  1–3 → "Bracket 3", 4+ → "Bracket 4–5". Explicitly does not model combo
  speed, mass land destruction, or extra-turn density — the real Bracket
  system does, but that's not reliably detectable from card text. This
  caveat is surfaced in the UI copy; keep it there if this logic changes.

- **`db.ts`** — `isSeeded` check so the API returns a helpful 503 instead
  of a raw SQL error if `npm run prepare-data` hasn't been run yet. Also
  the double-faced-card lookup: `findCardsByNames` tries the full card name
  first, then falls back to a `card_face_names` table (built in
  `import-scryfall.ts` for `transform`/`modal_dfc` layouts only) so a
  decklist naming just one face — "Fable of the Mirror-Breaker" rather than
  the full "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki" —
  still matches. That table is checked for existence before use (via the
  same `tableExists` helper `isSeeded` uses) so an old local database from
  before this existed degrades to exact-match-only instead of crashing the
  server on the first prepared statement.

## Known risk areas / things to verify

- **`better-sqlite3` is a native module.** This bit us on the real Render
  deploy: v11 (the original pin) has no prebuilt binary for newer Node
  versions and falls back to compiling from source, which fails outright
  on Node 26 because its addon code calls a V8 API
  (`PropertyCallbackInfo::This()`) that Node 26's V8 removed. Fixed by
  upgrading to v13, which is built on `node-addon-api` (N-API) instead of
  raw V8 bindings — N-API is ABI-stable across Node versions, so it
  doesn't break on newer Node the way v11 did. `server/package.json`'s
  `engines.node` is now `>=22` to match v13's own requirement. If this
  breaks again on some future Node version, check whether it's the same
  class of issue before assuming it's something else.
- **Scryfall's API/bulk-data shape.** `fetch-scryfall.ts` and
  `import-scryfall.ts` assume a specific JSON shape (`data[].type ===
  'oracle_cards'`, `card.legalities.commander`, `card.game_changer`,
  `card.color_identity`, etc.) based on Scryfall's documented API as of
  this project's creation. Worth a quick sanity check against a live
  response if anything about the import looks off.
- **Scryfall requires `User-Agent` and `Accept` headers** on every request
  and answers HTTP 400 without them — this broke the first real deploy.
  The User-Agent has to name this app specifically; Scryfall flags the
  defaults HTTP libraries send (Node's built-in `fetch` included) as junk
  traffic. `fetch-scryfall.ts` sets both. Don't drop them, and if you add
  new Scryfall calls anywhere, send them there too.
- **`render.yaml`'s `fromService`/`property: host` syntax** for wiring the
  client's `VITE_API_URL` to the server's URL was written from Render's
  current Blueprint docs but has never actually been deployed. If the
  Blueprint fails to sync, this is the first thing to check.
- **Card name matching is exact (case-insensitive) only** — no fuzzy
  matching. Real decklists will likely have some near-misses; worth seeing
  how bad this is in practice before deciding whether it needs fixing.
- **Double-faced cards only match by their full name.** The import stores
  Scryfall's `name`, which for a DFC is `Malakir Rebirth // Malakir Mire`.
  Sites that export both faces match fine, but any site exporting only the
  front face (`Malakir Rebirth`) will miss. This is a matching question
  rather than a parsing one — the fix would be indexing front-face names as
  an alternate key in `import-scryfall.ts`/`db.ts`, not more regex work in
  `parseList.ts`. Not done, since it's adjacent to the "no fuzzy matching"
  non-goal and worth deciding on deliberately.
- **The compiled build must keep `src/` as its root.** `db.ts` finds the
  card database with `path.join(__dirname, '..', 'data')`, which only
  lands on `server/data` if the compiled `db.js` sits one level under
  `server/` (i.e. `dist/db.js`). This is why the build runs against
  `tsconfig.build.json` (`rootDir: "src"`, `src/` only) rather than the
  root `tsconfig.json`, which type-checks `scripts/` too and would root
  the output a level higher (`dist/src/db.js`). That nesting broke the
  first working deploy in a nasty way: the server started fine and
  `/api/health` passed, but `db.ts` created an empty database at
  `dist/data/` that nothing ever seeds, so every recommendation returned
  the "database is empty" 503. If you change the build layout, start the
  compiled server and actually POST a list — a passing health check
  proves nothing here.

## Deployment

`render.yaml` + `DEPLOY.md` set up a free two-service deploy on Render
(static frontend + Node backend), with the backend rebuilding its SQLite
data from Scryfall on every deploy rather than using a persistent disk.
Untested end-to-end — see "Known risk areas" above.

## Explicit non-goals for v1 (don't scope-creep these back in without asking)

- No user accounts, saved lists, or deck history
- No fuzzy/typo-tolerant card name matching
- No combo detection for Bracket estimation
- No EDHREC data pulled yet — see "Pending decisions" below. A
  **non-functional** "EDHRec" placeholder button sits next to "Find combos"
  in `ComboFinder.tsx`; it fetches nothing and is `disabled`. The original
  "no EDHREC data of any kind" instruction has been clarified, not
  rescinded: the user wants to wait until this can be done responsibly, not
  ruled it out in principle.

## Pending decisions — proposed, not implemented

- **EDHREC integration.** Still not built — the placeholder button above is
  the only trace of this in the codebase. The user's current lean (as of
  the conversation that added the placeholder): a one-time, click-triggered
  lookup per commander, the same shape as the existing Commander Spellbook
  "Find combos" flow, rather than anything that runs automatically or scrapes
  in bulk. Don't wire up the button or add any EDHREC network call without
  the user confirming the approach first — the same politeness/caching
  discipline documented for `spellbook.ts` above should apply here once it's
  built (identifying User-Agent, cache repeat lookups, respect rate limits).

## Partner / Background support (rule 702.124)

Implemented: a commander suggestion with a Partner-family ability generates
both a solo entry and one entry per valid pairing, unified on the same
ranked list (see `partners.ts` and `synergy.ts` above). Covers all six
variants: Partner, Partner—[text] (grouped by suffix), Partner with [Name]
(symmetric name check), Friends forever, Choose a Background (paired against
every legal legendary Background), and Doctor's companion (paired against
an exact {Time Lord, Doctor} creature-type set). `CommanderSuggestion.cards`
is `CardRow[]` (length 1 or 2); the API's `CommanderSuggestionDTO.cards` is
`CommanderCardDTO[]` with a top-level `unitId` (both oracle ids, sorted and
joined — see `unitKey()`) used as the dismiss/row key instead of a single
card's own id. `/api/combos` takes `commanderNames: string[]` (1-2) so a
Spellbook lookup can be run against a pair. There is no "Partner" badge in
the UI by design — Partner-family keywords stay excluded from the generic
shared-keyword signal (see `synergy.ts`'s `EXCLUDED_KEYWORDS` note) rather
than surfaced as a tag, since the pairing itself is the feature.
Unverified against real Scryfall data — this environment has no network
access to Scryfall, so the detection regexes and pairing logic were
validated against hand-authored fixtures modeled on real card templating,
not the live bulk file. Worth a spot-check against a handful of real
Partner/Background cards (e.g. Tymna the Weaver, Kraum Ludevic's Opus,
Tiana Ship's Caretaker + a real Background) after the next `prepare-data`
run.
