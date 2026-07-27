# Commander? I Hardly Know 'Er

Paste or upload a Magic: The Gathering card list and get Commander
suggestions based on synergies found in that list, filtered to cards
currently legal in Commander, each with a "why this commander?" explanation
and an estimated power Bracket.

- **Client:** Vite + React + TypeScript + Zustand + TanStack Query/Table
- **Server:** Express + TypeScript + better-sqlite3
- **Card data:** [Scryfall](https://scryfall.com)'s bulk data (an official,
  static export — this app never scrapes EDHREC or hits Scryfall's live API
  at request time; see [Data sources](#data-sources) below)

## How it works

1. You paste or upload a card list.
2. The server looks each card up in a local SQLite database seeded from
   Scryfall.
3. It profiles your list (color identity, creature types, shared keywords,
   and thematic patterns like sacrifice/graveyard/tokens/etc. detected from
   oracle text).
4. It scores every Commander-eligible, currently-legal card — and every
   legal Partner/Background pairing (see below) — against that profile and
   returns the best matches, each tagged with an estimated Bracket.

**On kindred (what used to be called "tribal"):** a creature type only counts
if the commander's own rules text *cares* about it — merely being that type is
not enough. Krenko counts Goblins, Lathril taps Elves, Edgar Markov triggers
on Vampire spells; Silas Renn is a Human whose text never mentions Humans, so
a pile of Humans says nothing about him. A commander does not have to *be* the
type it cares about, since Ghoulcaller Gisa is a Human Wizard and one of the
best Zombie commanders in the format.

**On what scoring rewards:** a commander is scored on how *focused* a fit it
is, not how much of your list it can legally cast. Each signal counts for the
share of that commander's playable cards standing behind it, so a mono-black
commander whose every playable card feeds one theme beats a five-colour one
that can cast everything and half-supports the same theme. Colour identity
only decides which cards are eligible to count — breadth is what lets a
commander play your cards, never a reason to prefer one.

**On the Bracket estimate:** it's based on how many official
[Game Changer](https://mtgcommander.net) cards are involved — that's the one
hard, checkable signal in the Bracket system. Real bracket placement also
weighs combo speed, mass land destruction, and extra-turn density, which
can't be reliably detected from card text alone. Treat the estimate as a
starting point for a Rule 0 conversation, not a verdict.

## Setup

### 1. Install dependencies

```bash
npm install
npm run install:all
```

(`install:all` runs `npm install` in both `server/` and `client/`; the root
`npm install` is just for the `concurrently` dev script.)

### 2. Get the Scryfall card data

```bash
cd server && npm run prepare-data
```

This downloads Scryfall's **Oracle Cards** bulk file (~150–200MB, one entry
per unique card) to `server/data/oracle-cards.json` and seeds
`server/data/cards.sqlite` from it. Takes a few minutes on a home connection.

**It won't re-download if you already have a copy less than a week old** — it
reuses what's on disk and tells you how old it is, so iterating locally
doesn't mean pulling the file every time. To force a fresh pull:

```bash
npm run prepare-data:fresh
```

You rarely need to. Scryfall regenerates the file roughly daily, but the
ban list and Game Changers list — the two things whose *staleness* actually
matters here — change only a handful of times a year. Monthly is plenty;
the 7-day auto-refresh above already covers picking up new cards from a
fresh set (including any new Partner-family cards) sooner than that.

The freshness check only applies locally. A deploy always starts from a clean
checkout with no data directory, so it downloads every time and a deployed
copy is never stale.

### 3. Run the app

```bash
npm run dev
```

This starts the Express API on `http://localhost:4000` and the Vite dev
server on `http://localhost:5173` (which proxies `/api` to the backend).
Open `http://localhost:5173`.

### 4. Run the tests

```bash
cd server && npm test
cd client && npm test
```

Both are dependency-free (`node:assert` + [`tsx`](https://github.com/privatenumber/tsx),
no test framework) and run in a few seconds. See each `scripts/test-*.ts`
file for what's covered — deck-list parsing, Commander Spellbook response
normalisation, Bracket estimation, Partner/Background pairing, and the
scoring engine (including the union-across-a-pair semantics) on the server;
colour ordering, the "still has supporting cards" display filter, filter-bar
matching, and sort ordering on the client.

## Card list format

Plain text, one card per line. Quantities and any trailing export metadata —
set codes, collector numbers, foil/commander markers, Archidekt categories and
colour labels — are optional and get stripped automatically, so you can paste
an export straight from the usual deck sites without cleaning it up first:

```
Rampant Growth                                  bare name
1 Sol Ring                                      quantity
1x Arcane Signet                                "1x" / "1 x" also fine
1 Eternal Witness (C21) 263                     Moxfield, Arena, MTGO
1 Sol Ring (C21) 263 *F*                        ...with foil/commander markers
1x Command Tower (cmr) 350 [Lands] ^Have,#7289DA^   Archidekt
1 Lightning Bolt [SLD] 84                       TCGplayer Mass Entry
1 Sol Ring [Commander 2021]                     spelled-out set name
```

Blank lines, `//` and `#` comments, zone headers (`Commander`, `Sideboard`)
and grouping headers (`Creature (12)`) are ignored. Double-faced cards keep
their `//` separator (`Malakir Rebirth // Malakir Mire`), which is how
Scryfall spells those names — and are matched by either face's name alone,
so a list naming just the front face still resolves.

Card names are matched exactly, case-insensitively — there's no fuzzy
matching, so anything unrecognised comes back in the "not found" list rather
than being guessed at.

### Quantities and the singleton rule

Commander is a singleton format (rule 903.5b), so extra copies of a card are
ignored when scoring — a list is read as the deck you could legally build
from it, not as a pile. Ten copies of one card count once, and cannot make a
theme look supported on their own. Three exemptions are honoured, read off
the cards themselves rather than from a hardcoded list:

- **Basic lands**, by supertype — so snow basics and Wastes are covered too.
- Cards reading **"A deck can have any number of cards named …"** (Relentless
  Rats, Shadowborn Apostle, Dragon's Approach, and friends).
- Cards reading **"A deck can have up to _N_ cards named …"**, kept to `N`
  (Seven Dwarves, Nazgûl).

Repeats of a card across several lines are merged before this is applied, so
listing the same card three times is the same as listing it once. Whatever
gets trimmed is reported back as "*N* extra copies ignored" next to the
matched count, so a trimmed list never looks like a failed lookup.

## Partner, Background, and every other command-zone pairing

A commander with **Partner**, **Partner — [text]**, **Partner with [Name]**,
**Friends forever**, **Choose a Background**, or **Doctor's companion**
(rule 702.124 of the Comprehensive Rules) appears both as a solo suggestion
and as one suggestion per card it can legally share the command zone with,
unified on the same ranked list — not a separate section, and not
pre-computed ahead of time; every request scores the whole legal set of
solo commanders and pairs fresh. A pair's colour identity, creature types,
keywords, and themes are the union of both halves (rule 702.124e): a signal
either card would show on its own is enough to suggest the pair.

## Why a commander was suggested

Each suggestion has a **"Why this commander?"** disclosure. Expanding it shows
every creature type, keyword, and theme it shares with your list, the
specific cards behind each of those signals, and which cards drive the
Bracket estimate. Only cards that fit the commander's colour identity are
cited, and a theme/kindred type/keyword only counts — both as a reason shown here
and toward whether the commander is suggested at all — if it still has at
least three citable cards once narrowed that way. A global match that
thins out to one or two cards once narrowed to this commander's own colours
isn't a real pattern, so it's dropped entirely rather than shown as a weak
reason.

Tapping a commander's art, or any cited card's name, opens that card at its
own proportions. The rules-text box on the card face opens a fuller detail
view (mana cost, power/toughness, a link to the card on Scryfall).

Inside the "why" panel, **"Find combos"** asks
[Commander Spellbook](https://commanderspellbook.com/) which combos the
commander (or commander pair) makes with your cards, and shows both the ones
you can already assemble and the ones you're a card or two short of.

That lookup only ever runs when you click it — browsing suggestions sends
nothing to Commander Spellbook. Results are cached server-side for an hour,
and if their API asks us to back off we say so rather than retrying. Combo
data is theirs; the app just asks and displays it.

Next to "Find combos" is an **"EDHRec" button that does nothing yet** — it's
a reserved spot for a future one-time EDHREC lookup, added deliberately
ahead of the feature so the UI has a stable home for it. No EDHREC data is
fetched by this app today; see [Known limitations](#known-limitations-v1)
and `handoff.md` for the plan.

## Filtering, sorting, and exporting results

- **Filter** by color, Colorless/Multicolor, Bracket, and theme, all in the
  same tri-state include/exclude model: tap a chip once to require it,
  again to exclude it, again to clear it. Colour chips are subset matching
  when included (picking Black and Green shows what you could actually
  build in Golgari, not just anything that touches either colour) and
  touch matching when excluded (excluding Black drops anything with black
  in its identity). Colorless and Multicolor live in the same row as the
  WUBRG pips, since they're really just another way of describing a colour
  identity.
- **Sort** by best match (the server's score, the default) or by colour
  count → WUBRG order → name → mana value.
- Each suggestion's badge row shows a **match score**, relative to the best
  match currently on screen (the top suggestion always reads 100%). Hover
  or tap it for a breakdown of what drove the score — the kindred, theme and
  keyword signals it matched, and the pool they were weighed against.
- **Export** the current list via "Copy list" or "Download .txt".
- **Dismiss** individual suggestions (restorable) and page through the rest.

## Data sources

| Data | Source | How it's fetched |
| --- | --- | --- |
| Card text, types, color identity, legality, Game Changers | [Scryfall](https://scryfall.com)'s [Oracle Cards bulk data](https://scryfall.com/docs/api/bulk-data) | Downloaded once (`server/scripts/fetch-scryfall.ts` → `GET api.scryfall.com/bulk-data`, then the returned `download_uri`) and re-imported on every deploy — never queried live per request. |
| Combos | [Commander Spellbook](https://commanderspellbook.com)'s [`find-my-combos`](https://commanderspellbook.com/) API | Queried live, but only when you click "Find combos" on a specific suggestion (`server/src/services/spellbook.ts` → `POST backend.commanderspellbook.com/find-my-combos`). Responses are cached in memory for an hour. |
| Commander ban list, Game Changers list | Republished by Scryfall as `legalities.commander` / `game_changer` on each card in the bulk data above | No separate call — comes along with the card data. |
| Bracket System, Game Changers list (canonical) | The Commander Format Rules Committee, [mtgcommander.net](https://mtgcommander.net) | Not called directly; Scryfall's `game_changer` field is treated as the source of truth for which cards are on it. |

Both outbound calls send an identifying `User-Agent` (required by Scryfall,
good manners for Commander Spellbook) naming this app and linking back to
this repository — see `server/src/services/spellbook.ts` and
`server/scripts/fetch-scryfall.ts` if you fork this and want to update it to
identify your own copy instead.

**No EDHREC data is scraped or fetched anywhere in this app.** The EDHRec
button described above is a non-functional placeholder.

## Project layout

```
client/                     Vite + React + TS + Zustand + TanStack Query/Table
  src/
    api/                       fetchRecommendations/fetchCombos, wakeServer, TanStack Query hooks
    components/                 CommanderCard, filters, dialogs, upload panel, About panel
    lib/                         WUBRG ordering, filter/sort logic, "visible support" helpers
    store/                       client-only state (textarea contents, dismissals)
    types/                       DTOs mirroring the server's response shape
  scripts/                     npm test — dependency-free node:assert + tsx test files

server/                     Express + TS + better-sqlite3
  src/
    db.ts                       SQLite connection + queries
    routes/                      POST /api/recommend, POST /api/combos
    services/
      parseList.ts                Card-list text parser
      partners.ts                 Builds every legal solo/Partner-pair "commander unit"
      synergy.ts                  Collection profiling + commander scoring
      bracket.ts                  Bracket estimate heuristic
      spellbook.ts                Commander Spellbook adapter (cache, backoff, normalisation)
  scripts/
    fetch-scryfall.ts           Downloads the Oracle Cards bulk file (skips if recent)
    import-scryfall.ts          Seeds cards.sqlite from the downloaded bulk file
    test-*.ts                    npm test — dependency-free node:assert + tsx test files
  data/                         (gitignored) oracle-cards.json + cards.sqlite live here
```

## Deploying

See [`DEPLOY.md`](./DEPLOY.md) for a free, one-click Render setup (the repo's
`render.yaml` provisions both the API and the static frontend together).

## Known limitations (v1)

- Synergy detection is theme/kindred-pattern matching on oracle text, not a
  full combo or archetype model — it'll miss subtler synergies.
- Bracket estimate only accounts for Game Changers, not combos/MLD/extra
  turns (see above).
- Card name lookup is exact-match (case-insensitive) apart from the
  double-faced-card handling above. Typos or alternate card names (e.g.
  `Circle of Protection: Vampires` vs a shorthand) won't resolve — a
  fuzzy-match fallback would be a good next step.
- EDHREC integration is not implemented — see the EDHRec placeholder button
  above.
- `better-sqlite3` is a native module. `npm install` should fetch a
  prebuilt binary for most platforms; if it tries to compile from source
  and fails, you'll need a C++ toolchain (Xcode Command Line Tools on
  macOS, `build-essential` on Linux, or the "Desktop development with C++"
  workload on Windows).

## Contributing

This started as a solo hobby project — issues and pull requests are
welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for dev setup and
conventions, and [`handoff.md`](./handoff.md) for the fuller design
rationale and known risk areas if you're picking up unfamiliar parts of the
codebase. `CHANGELOG.md` tracks notable changes; please add an entry under
`[Unreleased]` alongside any user-facing change.

## License

[MIT](./LICENSE)
