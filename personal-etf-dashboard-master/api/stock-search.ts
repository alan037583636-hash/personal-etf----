import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';
import { findTaiwanStock } from '../src/utils/stockMetadata';

interface StockSearchResult {
  symbol: string;
  name: string;
  sector?: string;
}

interface CacheEntry {
  timestamp: number;
  results: StockSearchResult[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sectorFromProfile(industry = '', sector = ''): string | undefined {
  const description = `${industry} ${sector}`;
  if (/semiconductor/i.test(description)) return '半導體';
  if (/electronic|electronics/i.test(description)) return '電子零組件';
  if (/computer|hardware/i.test(description)) return '電腦及週邊';
  if (/communication|telecommunication/i.test(description)) return '通信網路';
  if (/technology|software|internet/i.test(description)) return '科技';
  if (/financial|bank|insurance/i.test(description)) return '金融';
  if (/industrial|manufacturing|machinery/i.test(description)) return '工業與機械';
  return undefined;
}

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

  const knownStock = findTaiwanStock(query);
  if (knownStock) {
    const result = [{
      symbol: `${knownStock.code}.${knownStock.exchange || 'TW'}`,
      name: knownStock.name,
      sector: knownStock.sector,
    }];
    cache.set(cacheKey, { timestamp: Date.now(), results: result });
    return res.status(200).json({ success: true, results: result });
  }

  try {
    const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });
    const isTaiwanCode = /^\d{4,6}(?:\.(?:TW|TWO))?$/i.test(query);
    const hasChinese = /[\u3400-\u9fff]/.test(query);
    const convertQuotes = (quotes: unknown[]): StockSearchResult[] =>
      quotes.flatMap((value) => {
        if (!isRecord(value)) return [];
        const symbol = typeof value.symbol === 'string' ? value.symbol : '';
        if (!symbol) return [];
        const stock = findTaiwanStock(symbol);
        const longname = typeof value.longname === 'string' ? value.longname : '';
        const shortname = typeof value.shortname === 'string' ? value.shortname : '';
        const chineseName = [shortname, longname].find((name) => /[\u3400-\u9fff]/.test(name));
        const name = stock?.name || chineseName || longname || shortname || symbol;
        return [{ symbol, name, sector: stock?.sector }];
      });

    const searchQuotes = async (searchQuery: string): Promise<StockSearchResult[]> => {
      const searchResult = await yahooFinance.search(searchQuery, { quotesCount: 10, newsCount: 0 });
      return convertQuotes(searchResult.quotes);
    };

    let quotes: StockSearchResult[] = [];
    try {
      quotes = await searchQuotes(query);
    } catch (error) {
      console.warn('Yahoo Finance 搜尋未取得結果，改用台股搜尋建議 API:', error);
    }

    if (quotes.length === 0) {
      const suggestionUrl = new URL('https://query1.finance.yahoo.com/v1/finance/search');
      suggestionUrl.searchParams.set('q', query);
      suggestionUrl.searchParams.set('quotesCount', '10');
      suggestionUrl.searchParams.set('newsCount', '0');
      suggestionUrl.searchParams.set('region', 'TW');
      suggestionUrl.searchParams.set('lang', 'zh-TW');
      const response = await fetch(suggestionUrl);
      if (!response.ok) throw new Error(`Yahoo 台股搜尋建議回傳 HTTP ${response.status}`);
      const suggestionResult: unknown = await response.json();
      const suggestionQuotes = isRecord(suggestionResult) && Array.isArray(suggestionResult.quotes)
        ? suggestionResult.quotes
        : [];
      quotes = convertQuotes(suggestionQuotes);
    }

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

    const enrichedResults = await Promise.all(results.map(async (result) => {
      const stock = findTaiwanStock(result.symbol) || findTaiwanStock(result.name);
      if (stock) return { ...result, name: stock.name, sector: stock.sector };
      if (!/\.(TW|TWO)$/i.test(result.symbol)) return result;
      try {
        const profile = await yahooFinance.quoteSummary(result.symbol, {
          modules: ['assetProfile', 'summaryProfile'],
        });
        const industry = profile.assetProfile?.industry || profile.summaryProfile?.industry || '';
        const sector = profile.assetProfile?.sector || profile.summaryProfile?.sector || '';
        return { ...result, sector: sectorFromProfile(industry, sector) };
      } catch (error) {
        console.warn(`讀取 ${result.symbol} 產業資料失敗:`, error);
        return result;
      }
    }));

    cache.set(cacheKey, { timestamp: Date.now(), results: enrichedResults });
    return res.status(200).json({ success: true, results: enrichedResults });
  } catch (error) {
    console.error('API /api/stock-search 發生錯誤:', error);
    return res.status(502).json({
      success: false,
      error: '目前無法連線至 Yahoo Finance 搜尋，請稍後再試。',
    });
  }
}
