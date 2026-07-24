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
- **Zustand** for state — one store, `client/src/store/useAppStore.ts`
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

```
package.json          root convenience script (npm run dev via concurrently)
render.yaml            Render Blueprint — provisions both services
README.md              setup + usage instructions for a human
DEPLOY.md              Render deployment walkthrough

client/                Vite + React + TS + Zustand
  vite.config.ts         dev-server proxy: /api -> localhost:4000
  .env.example            documents VITE_API_URL (blank in dev)
  src/
    main.tsx, App.tsx     entry point / page shell
    index.css              design system: parchment/ink palette, mana pips
    store/useAppStore.ts   rawList, result, isLoading, error
    api/client.ts           fetchRecommendations() -> POST /api/recommend
    types/index.ts          DTOs mirroring the server's response shape
    components/
      CardListUpload.tsx     paste or upload .txt, submit
      RecommendationResults.tsx  match summary + not-found list
      CommanderCard.tsx        one suggestion: pips, badges, bracket note

server/                Express + TS + better-sqlite3
  src/
    index.ts               app entry; CORS via optional CLIENT_ORIGIN env var
    db.ts                   SQLite connection + findCardsByNames / getCommanderCandidates
    types.ts                CardRow shape (mirrors the cards table)
    routes/recommend.ts      POST /api/recommend — the only endpoint
    services/
      parseList.ts            decklist text -> [{name, quantity}]
      synergy.ts               profile-building + commander scoring (the core logic)
      bracket.ts               Game-Changer-count -> Bracket estimate
  scripts/
    fetch-scryfall.ts        downloads current Oracle Cards bulk file from Scryfall's API
    import-scryfall.ts       parses that file into server/data/cards.sqlite
  data/                     gitignored; oracle-cards.json + cards.sqlite live here
```

## Core logic, summarized (read the files for full detail)

- **`parseList.ts`** — regex-based parser. Handles `1 Sol Ring`,
  `1x Sol Ring`, bare card names, and strips trailing `(SET) 123`
  collector-number suffixes. Skips blank lines, `//`/`#` comments, and
  section headers like `Commander:`/`Sideboard:`.

- **`synergy.ts`** — the heart of the app.
  1. Builds a `CollectionProfile` from the matched cards: color-identity
     counts, creature-type counts, and counts against ~12 hand-picked
     oracle-text theme regexes (sacrifice, graveyard, +1/+1 counters,
     tokens, artifacts, spellslinger, lifegain, draw, mill, aristocrats,
     landfall, reanimation).
  2. Scores every Commander-eligible, currently-legal card: requires
     nonzero color-identity overlap AND at least one tribal/theme signal
     (signal threshold: appears ≥2 times in the list) to even be
     considered. Score = `coverageRatio * 50 + tribalMatches * 15 +
     themeMatches * 10`.
  - This is intentionally a short, readable heuristic, not a combo/archetype
    model — documented as a known limitation, not a bug to silently "fix"
    into something more complex without discussing it first.

- **`bracket.ts`** — Bracket estimate is based *only* on Game Changer count
  among matched cards + the suggested commander itself: 0 → "Bracket 1–2",
  1–3 → "Bracket 3", 4+ → "Bracket 4–5". Explicitly does not model combo
  speed, mass land destruction, or extra-turn density — the real Bracket
  system does, but that's not reliably detectable from card text. This
  caveat is surfaced in the UI copy; keep it there if this logic changes.

- **`db.ts`** — `isSeeded` check so the API returns a helpful 503 instead
  of a raw SQL error if `npm run prepare-data` hasn't been run yet.

## Known risk areas / things to verify

- **`better-sqlite3` is a native module.** `npm install` should fetch a
  prebuilt binary for most common platforms; if it tries to compile from
  source, it needs a C++ toolchain. Worth confirming this installs cleanly
  wherever this next runs.
- **Scryfall's API/bulk-data shape.** `fetch-scryfall.ts` and
  `import-scryfall.ts` assume a specific JSON shape (`data[].type ===
  'oracle_cards'`, `card.legalities.commander`, `card.game_changer`,
  `card.color_identity`, etc.) based on Scryfall's documented API as of
  this project's creation. Worth a quick sanity check against a live
  response if anything about the import looks off.
- **`render.yaml`'s `fromService`/`property: host` syntax** for wiring the
  client's `VITE_API_URL` to the server's URL was written from Render's
  current Blueprint docs but has never actually been deployed. If the
  Blueprint fails to sync, this is the first thing to check.
- **Card name matching is exact (case-insensitive) only** — no fuzzy
  matching. Real decklists will likely have some near-misses; worth seeing
  how bad this is in practice before deciding whether it needs fixing.

## Deployment

`render.yaml` + `DEPLOY.md` set up a free two-service deploy on Render
(static frontend + Node backend), with the backend rebuilding its SQLite
data from Scryfall on every deploy rather than using a persistent disk.
Untested end-to-end — see "Known risk areas" above.

## Explicit non-goals for v1 (don't scope-creep these back in without asking)

- No user accounts, saved lists, or deck history
- No fuzzy/typo-tolerant card name matching
- No combo detection for Bracket estimation
- No EDHREC data of any kind, scraped or otherwise
