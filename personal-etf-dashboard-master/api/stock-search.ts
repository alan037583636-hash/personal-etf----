import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';

interface StockSearchResult {
  symbol: string;
  name: string;
}

interface CacheEntry {
  timestamp: number;
  results: StockSearchResult[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: '僅支援 GET 請求。' });
  }

  const rawQuery = req.query?.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery || '').trim();
  if (query.length < 2 || query.length > 64 || /[\u0000-\u001f]/.test(query)) {
    return res.status(400).json({ success: false, error: '請輸入 2 至 64 個字元的股票名稱或代號。' });
  }

  const cacheKey = query.toLocaleUpperCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.status(200).json({ success: true, results: cached.results });
  }

  try {
    const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });
    const isTaiwanCode = /^\d{4,6}(?:\.(?:TW|TWO))?$/i.test(query);
    const hasChinese = /[\u3400-\u9fff]/.test(query);
    const searchQuotes = async (searchQuery: string): Promise<StockSearchResult[]> => {
      const searchResult = await yahooFinance.search(searchQuery, { quotesCount: 10, newsCount: 0 });
      return searchResult.quotes.flatMap((quote) => {
        const symbol = typeof quote.symbol === 'string' ? quote.symbol : '';
        if (!symbol) return [];
        const name =
          (typeof quote.longname === 'string' && quote.longname) ||
          (typeof quote.shortname === 'string' && quote.shortname) ||
          symbol;
        return [{ symbol, name }];
      });
    };

    const quotes = await searchQuotes(query);
    let candidates = quotes;

    if (isTaiwanCode) {
      const baseCode = query.replace(/\.(TW|TWO)$/i, '');
      candidates = quotes.filter((quote) => quote.symbol.replace(/\.(TW|TWO)$/i, '') === baseCode);
      if (candidates.length === 0 && !/\.(TW|TWO)$/i.test(query)) {
        for (const suffix of ['TW', 'TWO']) {
          const suffixResults = await searchQuotes(`${baseCode}.${suffix}`);
          candidates = suffixResults.filter(
            (quote) => quote.symbol.replace(/\.(TW|TWO)$/i, '') === baseCode
          );
          if (candidates.length > 0) break;
        }
      }
    } else if (hasChinese) {
      candidates = quotes.filter((quote) => /\.(TW|TWO)$/i.test(quote.symbol));
    }

    candidates.sort((left, right) => {
      const leftExact = left.symbol.toUpperCase() === query.toUpperCase() ? 1 : 0;
      const rightExact = right.symbol.toUpperCase() === query.toUpperCase() ? 1 : 0;
      const leftTaiwan = /\.(TW|TWO)$/i.test(left.symbol) ? 1 : 0;
      const rightTaiwan = /\.(TW|TWO)$/i.test(right.symbol) ? 1 : 0;
      return rightExact - leftExact || rightTaiwan - leftTaiwan;
    });

    const results = candidates.slice(0, 8).map(({ symbol, name }) => ({ symbol, name }));
    if (results.length === 0) {
      return res.status(404).json({ success: false, error: '找不到符合的股票或 ETF，請確認名稱或代號。' });
    }

    cache.set(cacheKey, { timestamp: Date.now(), results });
    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('API /api/stock-search 發生錯誤:', error);
    return res.status(502).json({
      success: false,
      error: '目前無法連線至 Yahoo Finance 搜尋，請稍後再試。',
    });
  }
}
