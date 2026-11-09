import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';
import { withJsonError, withTimeout } from './utils/withJsonError.ts';

// 記憶體快取 (In-Memory Cache Fallback)，在 Vercel Serverless 實例存活期間複用
interface CacheEntry {
  timestamp: number;
  data: any;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 分鐘快取

export interface HistoricalPricePoint {
  date: string;
  close: number;
  adjClose: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface StockPriceResult {
  symbol: string;
  querySymbol: string;
  name?: string;
  currency?: string;
  firstAvailableDate: string;
  latestDate: string;
  hasFullFiveYears: boolean;
  totalDays: number;
  quotes: HistoricalPricePoint[];
}

export interface StockPriceResponse {
  success: boolean;
  tradingDates: string[];
  stocks: Record<string, StockPriceResult>;
  warning?: string;
  fetchedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// 符號標準化：台股純數字 (如 2454, 2308, 3711, 2356, 0050) 自動補上 .TW
function normalizeSymbol(symbol: string): { original: string; yahooSymbol: string } {
  const clean = symbol.trim().toUpperCase();
  if (/^\d{4,6}$/.test(clean)) {
    return { original: clean, yahooSymbol: `${clean}.TW` };
  }
  return { original: clean, yahooSymbol: clean };
}

async function handleHistoricalPrices(req: VercelRequest, res: VercelResponse) {
  // 設定全域 CORS 標頭，避免跨域請求遭阻擋
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  res.setHeader('Cache-Control', 'no-store');

  // 處理瀏覽器 Preflight 預檢請求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const rawParam = req.query?.symbols;
    const symbolsParam = Array.isArray(rawParam)
      ? rawParam.join(',')
      : (rawParam as string) || '2454.TW,2308.TW,3711.TW,2356.TW,0050.TW';
    const forceRefresh = req.query?.refresh === '1';

    const rawSymbols = symbolsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawSymbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: '請提供至少一個股票代號 (symbols 參數)',
      });
    }

    const symbolMap = rawSymbols.map(normalizeSymbol);
    const cacheKey = symbolMap.map((s) => s.yahooSymbol).sort().join(',');

    const cached = cache.get(cacheKey);
    const now = Date.now();
    if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
      res.setHeader('X-Cache-Status', 'HIT');
      return res.status(200).json(cached.data);
    }

    // 計算 5 年前的開始日期
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const period1 = fiveYearsAgo.toISOString().split('T')[0];

    const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });
    const stockResults: Record<string, StockPriceResult> = {};
    const allDatesSet = new Set<string>();
    const warnings: string[] = [];

    // 並行抓取各檔股票之 5 年歷史收盤價
    await Promise.all(
      symbolMap.map(async ({ original, yahooSymbol }) => {
        try {
          const chartResult: unknown = await withTimeout(
            yf.chart(yahooSymbol, { period1, interval: '1d' }, { validateResult: false }),
            8000,
            `Yahoo Finance ${yahooSymbol} 歷史報價查詢`
          );

          const chart = isRecord(chartResult) ? chartResult : {};
          const meta = isRecord(chart.meta) ? chart.meta : {};
          const rawQuotes = Array.isArray(chart.quotes) ? chart.quotes : [];
          const validQuotes: HistoricalPricePoint[] = [];

          for (const value of rawQuotes) {
            if (!isRecord(value)) continue;
            const date = value.date;
            const close = value.close;
            if ((date instanceof Date || typeof date === 'string' || typeof date === 'number') &&
                typeof close === 'number' && Number.isFinite(close)) {
              const dateStr =
                date instanceof Date
                  ? date.toISOString().split('T')[0]
                  : new Date(date).toISOString().split('T')[0];
              if (!dateStr || dateStr === 'Invalid Date') continue;

              // 抓取並使用 Adj Close (還原權息收盤價)
              const adjCloseVal =
                typeof value.adjclose === 'number' && Number.isFinite(value.adjclose)
                  ? value.adjclose
                  : close;

              validQuotes.push({
                date: dateStr,
                close: Math.round(close * 100) / 100,
                adjClose: Math.round(adjCloseVal * 100) / 100,
                open: typeof value.open === 'number' ? Math.round(value.open * 100) / 100 : undefined,
                high: typeof value.high === 'number' ? Math.round(value.high * 100) / 100 : undefined,
                low: typeof value.low === 'number' ? Math.round(value.low * 100) / 100 : undefined,
                volume: typeof value.volume === 'number' ? value.volume : undefined,
              });
              allDatesSet.add(dateStr);
            }
          }

          validQuotes.sort((a, b) => a.date.localeCompare(b.date));

          const firstDate = validQuotes[0]?.date || '';
          const lastDate = validQuotes[validQuotes.length - 1]?.date || '';

          const expectedStartDate = new Date(period1);
          const actualFirstDate = new Date(firstDate || period1);
          const diffDays =
            (actualFirstDate.getTime() - expectedStartDate.getTime()) / (1000 * 3600 * 24);
          const hasFullFiveYears = diffDays <= 90;

          if (!hasFullFiveYears && firstDate) {
            warnings.push(
              `股票 ${original} 上市未滿 5 年（首次收盤日: ${firstDate}），前期將按已上市標的動態重算權重。`
            );
          }

          const resultObj: StockPriceResult = {
            symbol: original,
            querySymbol: yahooSymbol,
            name: (typeof meta.shortName === 'string' && meta.shortName) ||
              (typeof meta.symbol === 'string' && meta.symbol) || original,
            currency: typeof meta.currency === 'string' ? meta.currency : 'TWD',
            firstAvailableDate: firstDate,
            latestDate: lastDate,
            hasFullFiveYears,
            totalDays: validQuotes.length,
            quotes: validQuotes,
          };

          stockResults[original] = resultObj;
          stockResults[yahooSymbol] = resultObj;
        } catch (err: any) {
          console.error(`抓取 ${yahooSymbol} 失敗:`, err?.message);
          warnings.push(
            `無法取得代號 ${original} (${yahooSymbol}) 的歷史股價，請檢查代號是否正確。`
          );
        }
      })
    );

    const unavailableSymbols = symbolMap.filter(({ original }) =>
      !stockResults[original]?.quotes.length
    );
    if (unavailableSymbols.length > 0) {
      return res.status(502).json({
        success: false,
        error: `無法取得以下標的的真實歷史行情：${unavailableSymbols.map(({ original }) => original).join('、')}`,
      });
    }

    const sortedTradingDates = Array.from(allDatesSet).sort();

    const responsePayload: StockPriceResponse = {
      success: true,
      tradingDates: sortedTradingDates,
      stocks: stockResults,
      warning: warnings.length > 0 ? warnings.join('\n') : undefined,
      fetchedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, {
      timestamp: now,
      data: responsePayload,
    });
    res.setHeader('X-Cache-Status', 'MISS');
    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error('API /api/historical-prices error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || '內部伺服器錯誤',
    });
  }
}

export default withJsonError(handleHistoricalPrices, '/api/historical-prices');
