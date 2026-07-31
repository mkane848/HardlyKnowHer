import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const DATA_DIR = path.join(__dirname, '..', 'data');
// JSONL, not JSON: Scryfall's bulk endpoint now publishes newline-delimited
// JSON, gzipped. See BulkDataEntry below.
const OUTPUT_PATH = path.join(DATA_DIR, 'oracle-cards.jsonl');
// Small companion file — see fetchFlavorNames below for why this isn't part
// of the bulk download.
const FLAVOR_NAMES_PATH = path.join(DATA_DIR, 'flavor-names.json');

// How long a downloaded copy is considered good enough to reuse. The bulk
// file only changes when Scryfall republishes it (roughly daily), and the
// things this app reads from it — the ban list, the Game Changers list —
// change a few times a year, so a week-old copy is fine for local work.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether we can skip the download and reuse what's on disk.
 *
 * This is a convenience for local iteration, where re-pulling ~170MB on every
 * run is the slow part. It has no effect on a deploy: the build starts from a
 * clean checkout with no data directory, so the file is never there and the
 * download always happens — which is what keeps a deployed copy current.
 */
function existingFileIsFresh(): { fresh: boolean; ageHours: number; sizeMb: string } | null {
  if (!fs.existsSync(OUTPUT_PATH)) return null;

  const stats = fs.statSync(OUTPUT_PATH);
  if (stats.size === 0) return null; // a truncated download is worse than none

  const ageMs = Date.now() - stats.mtimeMs;
  return {
    fresh: ageMs < MAX_AGE_MS,
    ageHours: Math.floor(ageMs / (60 * 60 * 1000)),
    sizeMb: (stats.size / 1024 / 1024).toFixed(1),
  };
}

// Scryfall requires both of these on every request and answers 400 without
// them. The User-Agent must identify this app specifically — they flag the
// defaults HTTP libraries send (Node's built-in fetch included) as junk
// traffic. See https://scryfall.com/docs/api
// Kept in sync with services/spellbook.ts's User-Agent by hand — see the
// note there on why it isn't read from package.json.
const SCRYFALL_HEADERS = {
  'User-Agent': 'CommanderIHardlyKnowEr/1.0.0 (hobby project; https://github.com/mkane848/HardlyKnowHer)',
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};

/**
 * One entry in Scryfall's bulk-data list.
 *
 * Scryfall changed this shape: entries used to carry `download_uri` (a plain
 * uncompressed JSON array) and `size`. Both are gone. The replacements are
 * `jsonl_download_uri` — newline-delimited JSON, gzipped — and
 * `compressed_size`. Reading the old field names silently yielded
 * `undefined`, which surfaced as "Failed to parse URL from undefined" and a
 * download size of "~NaNMB".
 *
 * Both fields are optional here so a future rename fails with the explicit
 * check below rather than another undefined-URL crash.
 */
interface BulkDataEntry {
  type: string;
  updated_at: string;
  jsonl_download_uri?: string;
  compressed_size?: number;
}

/**
 * Builds the "what went wrong" half of a failure message.
 *
 * Scryfall explains rejections in the response body — a JSON error object
 * whose `details` field says exactly what it objected to — while the status
 * code alone rarely narrows it down. These requests only ever run
 * unattended in a build log, so there's no chance to re-run them by hand
 * with more logging; whatever we print here is all you get.
 */
async function describeFailure(res: Response): Promise<string> {
  let body = '';
  try {
    body = (await res.text()).trim();
  } catch {
    // An unreadable body shouldn't swallow the status code.
  }

  if (!body) return `HTTP ${res.status}`;
  // Bounded in case a proxy or error page answers with a wall of HTML.
  const snippet = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  return `HTTP ${res.status}: ${snippet}`;
}

async function main() {
  const force = process.argv.includes('--force');
  const existing = existingFileIsFresh();

  if (existing?.fresh && !force) {
    console.log(
      `Reusing ${OUTPUT_PATH} (${existing.sizeMb}MB, ${existing.ageHours}h old).\n` +
        'Pass --force to download a fresh copy.'
    );
    // Still fetch the re-skin names if we've never got them. Reusing the bulk
    // file must not mean permanently skipping a companion file that didn't
    // exist when that copy was downloaded.
    if (!fs.existsSync(FLAVOR_NAMES_PATH)) await fetchFlavorNames();
    return;
  }

  console.log('Looking up the latest Scryfall bulk data URL...');
  const listRes = await fetch('https://api.scryfall.com/bulk-data', {
    headers: SCRYFALL_HEADERS,
  });
  if (!listRes.ok) {
    throw new Error(`Failed to list Scryfall bulk data (${await describeFailure(listRes)})`);
  }
  const { data } = (await listRes.json()) as { data: BulkDataEntry[] };
  const oracleCards = data.find((entry) => entry.type === 'oracle_cards');
  if (!oracleCards) {
    throw new Error('Could not find an "oracle_cards" entry in the Scryfall bulk data list.');
  }

  const downloadUri = oracleCards.jsonl_download_uri;
  if (!downloadUri) {
    throw new Error(
      'The "oracle_cards" bulk entry has no `jsonl_download_uri`. Scryfall has probably renamed the ' +
        'field again — check https://scryfall.com/docs/api/bulk-data for the current shape. ' +
        `Fields present: ${Object.keys(oracleCards).join(', ')}`
    );
  }

  const sizeMb = oracleCards.compressed_size
    ? `~${(oracleCards.compressed_size / 1024 / 1024).toFixed(1)}MB compressed`
    : 'size unknown';
  console.log(`Found Oracle Cards (updated ${oracleCards.updated_at}, ${sizeMb}). Downloading...`);

  const fileRes = await fetch(downloadUri, { headers: SCRYFALL_HEADERS });
  if (!fileRes.ok) {
    throw new Error(`Failed to download bulk file (${await describeFailure(fileRes)})`);
  }
  if (!fileRes.body) {
    throw new Error('Bulk file response had no body.');
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Streamed rather than buffered: the file is ~25MB gzipped but expands to
  // several hundred MB, and there's no reason to hold all of that in memory
  // on the way to disk.
  await pipeline(
    Readable.fromWeb(fileRes.body as Parameters<typeof Readable.fromWeb>[0]),
    createGunzip(),
    fs.createWriteStream(OUTPUT_PATH)
  );

  const written = fs.statSync(OUTPUT_PATH).size;
  console.log(`Saved to ${OUTPUT_PATH} (${(written / 1024 / 1024).toFixed(1)}MB uncompressed).`);

  await fetchFlavorNames();
}

/**
 * Names that appear on re-skinned printings, and the card they really are.
 *
 * Universes Beyond and similar releases reprint an existing card under a
 * different name — "Dracula, Voyager" is Edgar, Charmed Groom. Scryfall calls
 * that a `flavor_name`, and it lives on the *printing*, not the oracle
 * entry. The Oracle Cards bulk file has one row per oracle ID under the
 * canonical name, so a list naming the re-skin resolves to nothing at all.
 *
 * Fetched from the search API rather than by switching to the `default_cards`
 * bulk file: that file is one row per printing and three times the size, to
 * recover a few hundred names. This is ~3 requests.
 */
async function fetchFlavorNames() {
  console.log('Fetching re-skinned card names...');

  const entries: { flavor_name: string; oracle_id: string }[] = [];
  // unique=prints, not unique=cards. A re-skin lives on a *printing*, and
  // unique=cards collapses each card to one printing — usually the canonical
  // one, which is exactly the printing without the flavor name. That drops
  // 176 of the 617 re-skinned printings on the floor.
  let url: string | null =
    'https://api.scryfall.com/cards/search?q=has%3Aflavorname&unique=prints';

  while (url) {
    const res: Response = await fetch(url, { headers: SCRYFALL_HEADERS });
    if (!res.ok) {
      // Non-fatal on purpose. Re-skin matching is a nicety; failing the whole
      // data refresh over it would take the app down for a rounding error.
      console.warn(`  Skipping re-skinned names (${await describeFailure(res)}).`);
      return;
    }
    const page = (await res.json()) as {
      data?: { flavor_name?: string; oracle_id?: string }[];
      has_more?: boolean;
      next_page?: string;
    };
    for (const card of page.data ?? []) {
      if (card.flavor_name && card.oracle_id) {
        entries.push({ flavor_name: card.flavor_name, oracle_id: card.oracle_id });
      }
    }
    url = page.has_more ? page.next_page ?? null : null;
    // Scryfall asks for 50-100ms between requests. See
    // https://scryfall.com/docs/api — this is the whole reason it's polite
    // to page rather than hammer.
    if (url) await new Promise((resolve) => setTimeout(resolve, 100));
  }

  fs.writeFileSync(FLAVOR_NAMES_PATH, JSON.stringify(entries, null, 2));
  console.log(`Saved ${entries.length} re-skinned names to ${FLAVOR_NAMES_PATH}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
