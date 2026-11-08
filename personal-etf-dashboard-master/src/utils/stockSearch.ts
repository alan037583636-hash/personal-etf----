import { findTaiwanStock, normalizeStockSymbol, searchTaiwanStocks } from './stockMetadata';
import { readJsonResponse } from './http';

export interface StockSearchMatch {
  symbol: string;
  name: string;
  sector?: string;
}

interface StockSearchResponse {
  success: boolean;
  results?: StockSearchMatch[];
  error?: string;
}

export async function searchStock(query: string): Promise<StockSearchMatch> {
  const cleanQuery = query.trim();
  const localMatches = searchTaiwanStocks(cleanQuery);
  const knownStock = localMatches[0] || findTaiwanStock(cleanQuery);
  if (knownStock) {
    return {
      symbol: normalizeStockSymbol(knownStock.code, knownStock),
      name: knownStock.name,
      sector: knownStock.sector,
    };
  }

  const response = await fetch(`/api/stock-search?q=${encodeURIComponent(cleanQuery)}`);
  const result = await readJsonResponse<StockSearchResponse>(
    response,
    '股票搜尋伺服器暫時無法處理請求，請稍後再試。'
  );
  if (!response.ok || !result.success || !result.results?.length) {
    throw new Error(result.error || '找不到符合的股票或 ETF，請確認名稱或代號。');
  }

  const match =
    result.results.find(
      (item) =>
        item.name.localeCompare(cleanQuery, undefined, { sensitivity: 'accent' }) === 0 ||
        item.symbol.toUpperCase() === cleanQuery.toUpperCase()
    ) || result.results[0];

  return {
    symbol: normalizeStockSymbol(match.symbol),
    name: match.name,
    sector: match.sector,
  };
}
