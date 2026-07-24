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

The app needs a local copy of Scryfall's **Oracle Cards** bulk file. This
project doesn't download it automatically — grab it yourself:

1. Go to <https://scryfall.com/docs/api/bulk-data>
2. Download the **Oracle Cards** JSON file (~100–150MB — it's one entry per
   unique card, which is what you want here, not "All Cards")
3. Save it as `server/data/oracle-cards.json`

Then seed the database:

```bash
npm run import-scryfall
```

This creates `server/data/cards.sqlite`. Re-run this whenever you download a
fresh bulk file (Scryfall regenerates it roughly every 12–24 hours, but the
ban list / Game Changers list only change a handful of times a year, so
there's no need to do this often — monthly is plenty).

### 3. Run the app

```bash
npm run dev
```

This starts the Express API on `http://localhost:4000` and the Vite dev
server on `http://localhost:5173` (which proxies `/api` to the backend).
Open `http://localhost:5173`.

## Card list format

Plain text, one card per line. Quantities and trailing set/collector info are
optional and get stripped automatically:

```
1 Sol Ring
1x Arcane Signet
Rampant Growth
1 Eternal Witness (C21) 263
```

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
