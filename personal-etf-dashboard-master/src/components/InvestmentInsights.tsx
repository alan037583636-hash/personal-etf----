import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';
import { PerformanceMetrics, PortfolioHolding, RealDataApiResponse } from '../types/etf';
import { getStockSector } from '../utils/stockMetadata';
import { readJsonResponse } from '../utils/http';

interface InvestmentInsightsProps {
  holdings: PortfolioHolding[];
  realData: RealDataApiResponse | null;
  metrics: PerformanceMetrics;
}

interface AiInsight {
  summary: string;
  pros: string[];
  risks: string[];
  provider: string;
}

interface MarketInsightResponse {
  success: boolean;
  symbol: string;
  latestDate?: string;
  changePercent?: number;
  error?: string;
}

interface HoldingPerformance {
  name: string;
  weight: number;
  returnPercent: number;
  annualizedVolatility: number;
}

const getRecentPerformance = (holding: PortfolioHolding, realData: RealDataApiResponse | null) => {
  const stock = realData?.stocks[holding.symbol] || realData?.stocks[`${holding.symbol}.TW`];
  const quotes = stock?.quotes || [];
  if (quotes.length < 2) return null;

  const recentQuotes = quotes.slice(-64);
  const prices = recentQuotes.map((quote) => quote.adjClose || quote.close).filter((price) => price > 0);
  if (prices.length < 2) return null;

  const dailyReturns = prices.slice(1).map((price, index) => price / prices[index] - 1);
  const average = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((sum, value) => sum + (value - average) ** 2, 0) / dailyReturns.length;

  return {
    name: holding.name || holding.symbol,
    weight: Number(holding.weight) || 0,
    returnPercent: ((prices[prices.length - 1] / prices[0]) - 1) * 100,
    annualizedVolatility: Math.sqrt(variance) * Math.sqrt(252) * 100,
  } satisfies HoldingPerformance;
};

export const InvestmentInsights: React.FC<InvestmentInsightsProps> = ({ holdings, realData, metrics }) => {
  const [marketChange, setMarketChange] = useState<number | null>(null);
  const [marketDate, setMarketDate] = useState<string | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [aiInsights, setAiInsights] = useState<AiInsight | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadMarketTrend = async () => {
      try {
        const response = await fetch('/api/market-insights', { signal: controller.signal });
        const result = await readJsonResponse<MarketInsightResponse>(
          response,
          '台灣加權指數伺服器回傳無效資料。'
        );
        if (!response.ok || !result.success || typeof result.changePercent !== 'number') {
          throw new Error(result.error || '暫時無法取得台灣加權指數趨勢。');
        }
        setMarketChange(result.changePercent);
        setMarketDate(result.latestDate || null);
        setMarketError(null);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setMarketError(error instanceof Error ? error.message : '暫時無法取得台灣加權指數趨勢。');
      }
    };

    void loadMarketTrend();
    return () => controller.abort();
  }, []);

  const analysis = useMemo(() => {
    const totalWeight = holdings.reduce((sum, holding) => sum + (Number(holding.weight) || 0), 0);
    const sectors = new Map<string, number>();
    for (const holding of holdings) {
      const sector = getStockSector(holding.symbol, holding.name, holding.sector);
      const riskGroup = /IC 設計|晶圓代工|半導體封測/.test(sector) ? '半導體供應鏈' : sector;
      sectors.set(riskGroup, (sectors.get(riskGroup) || 0) + (Number(holding.weight) || 0));
    }

    const sectorConcentrations = Array.from(sectors.entries())
      .map(([sector, weight]) => ({ sector, percent: totalWeight > 0 ? (weight / totalWeight) * 100 : 0 }))
      .sort((left, right) => right.percent - left.percent);
    const performances = holdings
      .map((holding) => getRecentPerformance(holding, realData))
      .filter((performance): performance is HoldingPerformance => performance !== null);
    const performanceWeight = performances.reduce((sum, performance) => sum + performance.weight, 0);
    const weightedReturn =
      performanceWeight > 0
        ? performances.reduce(
            (sum, performance) => sum + performance.returnPercent * performance.weight,
            0
          ) / performanceWeight
        : null;

    return { sectorConcentrations, performances, weightedReturn };
  }, [holdings, realData]);

  const pros: string[] = [];
  const cons: string[] = [];
  const topSector = analysis.sectorConcentrations[0];

  if (topSector && topSector.percent >= 35) {
    cons.push(`${topSector.sector} 佔組合約 ${topSector.percent.toFixed(0)}%，產業集中可能放大單一供應鏈波動。`);
  } else if (analysis.sectorConcentrations.length > 1) {
    pros.push(`最大產業權重約 ${topSector?.percent.toFixed(0)}%，目前配置分散於多個領域，有助降低單一產業依賴。`);
  }

  if (analysis.weightedReturn !== null) {
    if (analysis.weightedReturn >= 5) {
      pros.push(`可取得報價的持股近約 3 個月加權報酬約 +${analysis.weightedReturn.toFixed(1)}%。`);
    } else if (analysis.weightedReturn <= -5) {
      cons.push(`可取得報價的持股近約 3 個月加權報酬約 ${analysis.weightedReturn.toFixed(1)}%，近期表現偏弱。`);
    } else {
      pros.push(`可取得報價的持股近約 3 個月加權報酬約 ${analysis.weightedReturn >= 0 ? '+' : ''}${analysis.weightedReturn.toFixed(1)}%，表現暫未出現明顯大幅偏離。`);
    }
  }

  const highestVolatility = analysis.performances.reduce<HoldingPerformance | null>(
    (highest, performance) =>
      !highest || performance.annualizedVolatility > highest.annualizedVolatility ? performance : highest,
    null
  );
  if (highestVolatility && highestVolatility.annualizedVolatility >= 45) {
    cons.push(`${highestVolatility.name} 近約 3 個月年化波動度約 ${highestVolatility.annualizedVolatility.toFixed(0)}%，短期價格起伏較大。`);
  } else if (highestVolatility && highestVolatility.annualizedVolatility < 25) {
    pros.push(`近期可觀察持股中最高年化波動度約 ${highestVolatility.annualizedVolatility.toFixed(0)}%，相對溫和；此數值不代表未來風險。`);
  }

  if (analysis.performances.length < holdings.length) {
    cons.push('部分持股尚無足夠近期報價，報酬與波動度分析未涵蓋全部持股。');
  }

  const prosKey = pros.join('\n');
  const consKey = cons.join('\n');

  useEffect(() => {
    const controller = new AbortController();
    const ruleInsight: AiInsight = {
      summary: `組合目前淨值 ${metrics.currentNav.toFixed(2)} 元，5 年 CAGR 為 ${metrics.cagr.toFixed(2)}%；歷史表現不代表未來結果。`,
      pros: pros.length ? pros : ['目前資料不足以確認明顯優勢，請持續追蹤持股與產業變化。'],
      risks: cons.length ? cons : ['未觸發明顯集中或波動警示，市場風險仍可能快速改變。'],
      provider: '內建規則',
    };
    setAiInsights(ruleInsight);
    setAiError(null);

    const requestBody = {
      holdings: holdings.map((holding) => ({
        symbol: holding.symbol,
        name: holding.name,
        weight: Number(holding.weight) || 0,
        sector: getStockSector(holding.symbol, holding.name, holding.sector),
      })),
      sectors: analysis.sectorConcentrations,
      recentPerformance: analysis.performances,
      market: { changePercent: marketChange, latestDate: marketDate },
      metrics: {
        currentNav: metrics.currentNav,
        cagr: metrics.cagr,
        maxDrawdown: metrics.maxDrawdown,
        allTimeReturn: metrics.allTimeReturn,
      },
    };

    const loadAiInsight = async () => {
      try {
        const response = await fetch('/api/ai-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        const result: unknown = await readJsonResponse<unknown>(
          response,
          '智能診斷伺服器回傳無效資料。'
        );
        if (!response.ok || !isAiInsight(result)) {
          throw new Error('目前無法取得智能診斷，已改用內建規則。');
        }
        setAiInsights(result);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setAiError(error instanceof Error ? error.message : '目前無法取得智能診斷。');
      }
    };

    void loadAiInsight();
    return () => controller.abort();
  }, [holdings, analysis, metrics, marketChange, marketDate, prosKey, consKey]);

  const displayedInsights = aiInsights || {
    summary: '正在整理目前組合資料。',
    pros: pros.length ? pros : ['目前資料不足以確認明顯優勢，請持續追蹤持股與產業變化。'],
    risks: cons.length ? cons : ['未觸發明顯集中或波動警示，市場風險仍可能快速改變。'],
    provider: '內建規則',
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-700" />
          <h2 className="text-sm font-bold text-slate-900">📊 投資組合智能診斷與市場洞察</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {displayedInsights.provider}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          {marketChange !== null && marketChange >= 0 ? (
            <TrendingUp className="w-3.5 h-3.5 text-red-600" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
          )}
          <span>
            台灣加權指數近約 3 個月：
            {marketChange === null ? (marketError ? '資料暫不可用' : '載入中…') : `${marketChange >= 0 ? '+' : ''}${marketChange.toFixed(2)}%`}
            {marketDate ? `（截至 ${marketDate}）` : ''}
          </span>
        </div>
      </div>

      <p className="rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-700">
        {displayedInsights.summary}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3.5">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-2">
            <Lightbulb className="w-3.5 h-3.5" /> 近期潛在優勢（Pros）
          </h3>
          {displayedInsights.pros.length ? (
            <ul className="space-y-1.5 text-xs leading-relaxed text-emerald-900">
              {displayedInsights.pros.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          ) : (
            <p className="text-xs text-emerald-900">目前資料不足以確認明顯優勢，請搭配自身投資目標評估。</p>
          )}
        </div>

        <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3.5">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" /> 風險警語（Cons）
          </h3>
          {displayedInsights.risks.length ? (
            <ul className="space-y-1.5 text-xs leading-relaxed text-amber-950">
              {displayedInsights.risks.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          ) : (
            <p className="text-xs text-amber-950">未觸發明顯集中或波動警示；市場風險仍可能快速改變。</p>
          )}
        </div>
      </div>

      {marketError && <p role="status" className="text-[11px] text-slate-500">{marketError}</p>}
      {aiError && <p role="status" className="text-[11px] text-slate-500">{aiError}</p>}
      <p className="text-[11px] text-slate-400">
        分析依目前配置及可取得的歷史資料自動計算，僅供參考，非投資建議；歷史表現不代表未來結果。
      </p>
    </section>
  );
};

function isAiInsight(value: unknown): value is AiInsight {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return result.success === true &&
    typeof result.summary === 'string' &&
    Array.isArray(result.pros) &&
    result.pros.every((item) => typeof item === 'string') &&
    Array.isArray(result.risks) &&
    result.risks.every((item) => typeof item === 'string') &&
    typeof result.provider === 'string';
}
