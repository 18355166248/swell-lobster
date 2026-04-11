import { open, saveText } from './helpers.mjs';

const url = process.argv[2];
if (!url) { console.error('Usage: extract.mjs <url> [selector]'); process.exit(1); }

const selector = process.argv[3] || 'body';
const { page, mode, close } = await open(url);
try {
  const title = await page.title();
  const text = await page.evaluate(
    (sel) => (document.querySelector(sel) ?? document.body).innerText,
    selector
  );
  const file = saveText(`URL: ${url}\nTitle: ${title}\nBrowser: ${mode}\n\n${text}`, 'extract');
  console.log(JSON.stringify({ title, url, chars: text.length, file, browser: mode }));
} finally {
  await close();
}
