import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'oracle-cards.json');

// Scryfall requires both of these on every request and answers 400 without
// them. The User-Agent must identify this app specifically — they flag the
// defaults HTTP libraries send (Node's built-in fetch included) as junk
// traffic. See https://scryfall.com/docs/api
const SCRYFALL_HEADERS = {
  'User-Agent': 'MtgCommanderRecommender/0.1.0',
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};

interface BulkDataEntry {
  type: string;
  download_uri: string;
  updated_at: string;
  size: number;
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

  const sizeMb = (oracleCards.size / 1024 / 1024).toFixed(1);
  console.log(`Found Oracle Cards (updated ${oracleCards.updated_at}, ~${sizeMb}MB). Downloading...`);

  const fileRes = await fetch(oracleCards.download_uri, {
    headers: SCRYFALL_HEADERS,
  });
  if (!fileRes.ok) {
    throw new Error(`Failed to download bulk file (${await describeFailure(fileRes)})`);
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  fs.writeFileSync(OUTPUT_PATH, buffer);
  console.log(`Saved to ${OUTPUT_PATH} (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
