import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'oracle-cards.json');

interface BulkDataEntry {
  type: string;
  download_uri: string;
  updated_at: string;
  size: number;
}

async function main() {
  console.log('Looking up the latest Scryfall bulk data URL...');
  const listRes = await fetch('https://api.scryfall.com/bulk-data');
  if (!listRes.ok) {
    throw new Error(`Failed to list Scryfall bulk data (HTTP ${listRes.status})`);
  }
  const { data } = (await listRes.json()) as { data: BulkDataEntry[] };
  const oracleCards = data.find((entry) => entry.type === 'oracle_cards');
  if (!oracleCards) {
    throw new Error('Could not find an "oracle_cards" entry in the Scryfall bulk data list.');
  }

  const sizeMb = (oracleCards.size / 1024 / 1024).toFixed(1);
  console.log(`Found Oracle Cards (updated ${oracleCards.updated_at}, ~${sizeMb}MB). Downloading...`);

  const fileRes = await fetch(oracleCards.download_uri);
  if (!fileRes.ok) {
    throw new Error(`Failed to download bulk file (HTTP ${fileRes.status})`);
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
