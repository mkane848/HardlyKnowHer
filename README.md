# Commander Recommender

Upload a Magic: The Gathering card list and get Commander suggestions based on
synergies found in that list, filtered to cards currently legal in Commander,
with an estimated power Bracket for each suggestion.

- **Client:** Vite + React + TypeScript + Zustand
- **Server:** Express + TypeScript + better-sqlite3
- **Card data:** [Scryfall](https://scryfall.com) bulk data (official, static
  export — this app does not scrape EDHREC or hit Scryfall's live API at
  request time)

## How it works

1. You paste or upload a card list.
2. The server looks each card up in a local SQLite database seeded from
   Scryfall.
3. It profiles your list (color identity, creature types, thematic patterns
   like sacrifice/graveyard/tokens/etc. detected from oracle text).
4. It scores every Commander-eligible, currently-legal card against that
   profile and returns the best matches, each tagged with an estimated
   Bracket.

**On the Bracket estimate:** it's based on how many official
[Game Changer](https://mtgcommander.net) cards are involved — that's the one
hard, checkable signal in the Bracket system. Real bracket placement also
weighs combo speed, mass land destruction, and extra-turn density, which
can't be reliably detected from card text alone. Treat the estimate as a
starting point for a Rule 0 conversation, not a verdict.

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

(This just runs `npm install` in both `server/` and `client/`, plus the root
for the `concurrently` dev script.  You'll also want `npm install` at the
root itself: `npm install`.)

### 2. Get the Scryfall card data

```bash
cd server && npm run prepare-data
```

This downloads Scryfall's **Oracle Cards** bulk file (~170MB, one entry per
unique card) to `server/data/oracle-cards.json` and seeds
`server/data/cards.sqlite` from it. Takes a few minutes on a home connection.

**It won't re-download if you already have a copy less than a week old** — it
reuses what's on disk and tells you how old it is, so iterating locally
doesn't mean pulling 170MB every time. To force a fresh pull:

```bash
npm run prepare-data:fresh
```

You rarely need to. Scryfall regenerates the file every 12–24 hours, but the
things this app reads from it — the ban list and the Game Changers list —
change only a handful of times a year. Monthly is plenty.

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
Scryfall spells those names.

Card names are matched exactly, case-insensitively — there's no fuzzy
matching, so anything unrecognised comes back in the "not found" list rather
than being guessed at. `npm test` in `server/` covers the parser against each
of the formats above.

## Why a commander was suggested

Each suggestion has a **"Why this commander?"** disclosure. Expanding it shows
the commander's rules text, every creature type and theme it shares with your
list, the specific cards behind each of those signals, and which cards drive
the Bracket estimate. Only cards that fit the commander's colour identity are
cited, since anything else couldn't go in the deck.

Inside that panel, **"Find combos"** asks
[Commander Spellbook](https://commanderspellbook.com/) which combos the
commander makes with your cards, and shows both the ones you can already
assemble and the ones you're a card or two short of.

That lookup only ever runs when you click it — browsing suggestions sends
nothing to Commander Spellbook. Results are cached server-side for an hour, and
if their API asks us to back off we say so rather than retrying. Combo data is
theirs; the app just asks and displays.

## Project layout

```
client/   Vite + React + TS + Zustand frontend
server/
  src/
    db.ts              SQLite connection + queries
    routes/recommend.ts  POST /api/recommend
    services/
      parseList.ts     Card-list text parser
      synergy.ts        Collection profiling + commander scoring
      bracket.ts         Bracket estimate heuristic
  scripts/
    fetch-scryfall.ts   Downloads the Oracle Cards bulk file (skips if recent)
    import-scryfall.ts  Seeds cards.sqlite from the downloaded bulk file
  data/                 (gitignored) oracle-cards.json + cards.sqlite live here
```

## Deploying

See [`DEPLOY.md`](./DEPLOY.md) for a free, one-click Render setup (the repo's
`render.yaml` provisions both the API and the static frontend together).

## Known limitations (v1)

- Synergy detection is theme/tribal-pattern matching on oracle text, not a
  full combo or archetype model — it'll miss subtler synergies.
- Bracket estimate only accounts for Game Changers, not combos/MLD/extra
  turns (see above).
- Card name lookup is exact-match (case-insensitive). Typos or alternate
  card names (e.g. `Circle of Protection: Vampires` vs a shorthand) won't
  resolve — a fuzzy-match fallback would be a good next step.
- `better-sqlite3` is a native module. `npm install` should fetch a
  prebuilt binary for most platforms; if it tries to compile from source
  and fails, you'll need a C++ toolchain (Xcode Command Line Tools on
  macOS, `build-essential` on Linux, or the "Desktop development with C++"
  workload on Windows).
