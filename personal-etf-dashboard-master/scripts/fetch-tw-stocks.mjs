import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'src', 'data', 'twStockList.json');
const sources = [
  { market: 'TWSE', exchange: 'TW', url: 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=2' },
  { market: 'TPEx', exchange: 'TWO', url: 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=4' },
];

function decodeHtml(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .trim();
}

function parseIsinPage(html, { market, exchange }) {
  const rows = html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);
  const stocks = [];
  let category = '';

  for (const [, row] of rows) {
    const rawCells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    if (rawCells.length === 0) continue;

    const firstCell = rawCells[0];
    const firstText = decodeHtml(firstCell[2]);
    if (/colspan\s*=/i.test(firstCell[1])) {
      category = firstText;
      continue;
    }

    if (!/股票|ETF/i.test(category) || rawCells.length < 5) continue;

    const codeAndName = firstText.replace(/\s+/g, ' ').trim();
    const match = codeAndName.match(/^([0-9A-Z]{4,6})\s+(.+)$/i);
    if (!match) continue;

    const [, code, name] = match;
    if (!/股票|ETF/i.test(category)) continue;

    stocks.push({
      symbol: `${code}.${exchange}`,
      code,
      name: name.trim(),
      market,
      industry: decodeHtml(rawCells[4][2]) || (/\bETF\b/i.test(category) ? 'ETF' : '未分類'),
    });
  }

  return stocks;
}

async function fetchMarket(source) {
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`${source.market} 官方清單回傳 HTTP ${response.status}`);
  }
  const html = new TextDecoder('big5').decode(await response.arrayBuffer());
  return parseIsinPage(html, source);
}

const markets = await Promise.all(sources.map(fetchMarket));
const stocksBySymbol = new Map(markets.flat().map((stock) => [stock.symbol, stock]));
const stocks = [...stocksBySymbol.values()].sort((left, right) =>
  left.code.localeCompare(right.code, 'en', { numeric: true }) ||
  left.market.localeCompare(right.market)
);

for (const code of ['3481', '2383', '6239']) {
  if (!stocks.some((stock) => stock.code === code)) {
    throw new Error(`官方清單缺少必要驗證代號 ${code}，未寫入資料檔。`);
  }
}
if (stocks.length < 1500) {
  throw new Error(`官方清單僅解析出 ${stocks.length} 檔，未達完整市場資料檢查門檻。`);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(stocks, null, 2)}\n`, 'utf8');

const counts = stocks.reduce((result, stock) => {
  result[stock.market] = (result[stock.market] || 0) + 1;
  return result;
}, {});
console.log(`已產生 ${stocks.length} 檔上市櫃股票與 ETF：${JSON.stringify(counts)}`);
console.log(`資料檔：${path.relative(root, outputPath)}`);
