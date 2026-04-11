import { open, screenshot } from './helpers.mjs';

const url = process.argv[2];
if (!url) { console.error('Usage: screenshot.mjs <url> [name]'); process.exit(1); }

const name = process.argv[3] || 'screenshot';
const { page, mode, close } = await open(url);
try {
  const title = await page.title();
  const file = await screenshot(page, name);
  console.log(JSON.stringify({ title, url, file, browser: mode }));
} finally {
  await close();
}
