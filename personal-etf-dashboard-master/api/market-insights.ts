import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';
import { withJsonError, withTimeout } from './utils/withJsonError';

const CACHE_TTL_MS = 60 * 60 * 1000;
let cachedResult: { timestamp: number; changePercent: number; latestDate: string } | null = null;

async function handleMarketInsights(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: '僅支援 GET 請求。' });
  }

  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL_MS) {
    return res.status(200).json({
      success: true,
      symbol: '^TWII',
      changePercent: cachedResult.changePercent,
      latestDate: cachedResult.latestDate,
    });
  }

  try {
    const period1 = new Date();
    period1.setMonth(period1.getMonth() - 4);
    const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });
    const result = await withTimeout(
      yahooFinance.chart('^TWII', {
        period1: period1.toISOString().slice(0, 10),
        interval: '1d',
      }),
      8000,
      'Yahoo Finance 大盤查詢'
    );
    const quotes = (result.quotes || []).filter(
      (quote) => quote.date && typeof quote.close === 'number' && quote.close > 0
    );

    if (quotes.length < 2) {
      return res.status(502).json({ success: false, error: '目前沒有足夠的大盤歷史資料。' });
    }

    const recentQuotes = quotes.slice(-64);
    const first = recentQuotes[0];
    const last = recentQuotes[recentQuotes.length - 1];
    if (typeof first.close !== 'number' || typeof last.close !== 'number' || first.close <= 0) {
      return res.status(502).json({ success: false, error: '目前沒有有效的大盤收盤價資料。' });
    }
    const latestDate = last.date instanceof Date ? last.date.toISOString().slice(0, 10) : new Date(last.date).toISOString().slice(0, 10);
    const changePercent = Math.round(((last.close / first.close - 1) * 100) * 100) / 100;
    cachedResult = { timestamp: Date.now(), changePercent, latestDate };

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json({ success: true, symbol: '^TWII', changePercent, latestDate });
  } catch (error) {
    console.error('API /api/market-insights 發生錯誤:', error);
    return res.status(502).json({
      success: false,
      error: '目前無法取得台灣加權指數資料，請稍後再試。',
    });
  }
}

export default withJsonError(handleMarketInsights, '/api/market-insights');
