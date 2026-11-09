import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Lightbulb } from 'lucide-react';
import { PerformanceMetrics, PortfolioHolding, RealDataApiResponse, RiskMetrics } from '../types/etf';
import { readJsonResponse } from '../utils/http';
import { getStockSector } from '../utils/stockMetadata';

interface InvestmentInsightsProps {
  holdings: PortfolioHolding[];
  realData: RealDataApiResponse | null;
  metrics: PerformanceMetrics;
  riskMetrics: RiskMetrics;
}

interface HoldingPerformance {
  name: string;
  weight: number;
  returnPercent: number;
  annualizedVolatility: number;
}

interface Diagnosis {
  summary: string;
  pros: string[];
  cons: string[];
  provider: string;
}

interface DiagnosisResponse {
  success: boolean;
  summary?: string;
  pros?: string[];
  cons?: string[];
  provider?: string;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDiagnosisResponse(value: unknown): value is DiagnosisResponse {
  return isRecord(value) && typeof value.success === 'boolean';
}

function getRecentPerformance(
  holding: PortfolioHolding,
  realData: RealDataApiResponse | null
): HoldingPerformance | null {
  const stock = realData?.stocks[holding.symbol] || realData?.stocks[`${holding.symbol}.TW`];
  const quotes = stock?.quotes || [];
  if (quotes.length < 2) return null;

  const prices = quotes.slice(-64).map((quote) => quote.adjClose || quote.close).filter((price) => price > 0);
  if (prices.length < 2) return null;

  const dailyReturns = prices.slice(1).map((price, index) => price / prices[index] - 1);
  const average = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    dailyReturns.length;

  return {
    name: holding.name || holding.symbol,
    weight: Number(holding.weight) || 0,
    returnPercent: (prices[prices.length - 1] / prices[0] - 1) * 100,
    annualizedVolatility: Math.sqrt(variance * 252) * 100,
  };
}

function parseDiagnosisResponse(value: unknown): Diagnosis {
  if (!isDiagnosisResponse(value) || !value.success ||
      typeof value.summary !== 'string' || !Array.isArray(value.pros) ||
      !Array.isArray(value.cons) || typeof value.provider !== 'string') {
    const message = isDiagnosisResponse(value) && typeof value.error === 'string'
      ? value.error
      : '診斷服務回傳格式不正確，請稍後重試。';
    throw new Error(message);
  }

  const pros = value.pros.filter((item): item is string => typeof item === 'string');
  const cons = value.cons.filter((item): item is string => typeof item === 'string');
  if (!value.summary.trim() || pros.length === 0 || cons.length === 0) {
    throw new Error('診斷服務回傳內容不完整，請稍後重試。');
  }

  return { summary: value.summary, pros, cons, provider: value.provider };
}

export const InvestmentInsights: React.FC<InvestmentInsightsProps> = ({
  holdings,
  realData,
  metrics,
  riskMetrics,
}) => {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const analysis = useMemo(() => {
    const sectors = new Map<string, number>();
    for (const holding of holdings) {
      const sector = getStockSector(holding.symbol, holding.name, holding.sector);
      sectors.set(sector, (sectors.get(sector) || 0) + (Number(holding.weight) || 0));
    }

    const totalWeight = holdings.reduce((sum, holding) => sum + (Number(holding.weight) || 0), 0);
    const sectorConcentrations = Array.from(sectors.entries())
      .map(([sector, weight]) => ({
        sector,
        percent: totalWeight > 0 ? (weight / totalWeight) * 100 : 0,
      }))
      .sort((left, right) => right.percent - left.percent);
    const performances = holdings
      .map((holding) => getRecentPerformance(holding, realData))
      .filter((performance): performance is HoldingPerformance => performance !== null);

    return { sectorConcentrations, performances };
  }, [holdings, realData]);

  const requestBody = useMemo(() => JSON.stringify({
    holdings: holdings.map((holding) => ({
      symbol: holding.symbol,
      name: holding.name || holding.symbol,
      weight: Number(holding.weight) || 0,
      sector: getStockSector(holding.symbol, holding.name, holding.sector),
    })),
    sectors: analysis.sectorConcentrations,
    recentPerformance: analysis.performances,
    market: {
      changePercent: null,
      latestDate: realData?.tradingDates[realData.tradingDates.length - 1] || null,
    },
    metrics: {
      currentNav: metrics.currentNav,
      cagr: metrics.cagr,
      maxDrawdown: metrics.maxDrawdown,
      allTimeReturn: metrics.allTimeReturn,
    },
    riskMetrics,
  }), [analysis, holdings, metrics.allTimeReturn, metrics.cagr, metrics.currentNav, metrics.maxDrawdown, realData, riskMetrics]);

  useEffect(() => {
    const controller = new AbortController();
    if (holdings.length === 0) {
      setDiagnosis(null);
      setIsLoading(false);
      setError(null);
      return () => controller.abort();
    }

    const loadDiagnosis = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/ai-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: controller.signal,
        });
        const result = await readJsonResponse<unknown>(response, '診斷服務回傳無效資料，請稍後重試。');
        if (!response.ok) {
          const errorMessage = isDiagnosisResponse(result) && typeof result.error === 'string'
            ? result.error
            : `診斷服務暫時無法處理請求（HTTP ${response.status}）。`;
          throw new Error(errorMessage);
        }
        setDiagnosis(parseDiagnosisResponse(result));
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setDiagnosis(null);
        setError(requestError instanceof Error ? requestError.message : '診斷服務發生未知錯誤。');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadDiagnosis();
    return () => controller.abort();
  }, [holdings.length, requestBody, retryCount]);

  return (
    <section className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-700" />
          <h2 className="text-sm font-bold text-slate-900">📊 投資組合即時診斷</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {isLoading ? 'AI 分析中' : diagnosis?.provider || '等待診斷'}
          </span>
        </div>
      </div>

      {holdings.length === 0 ? (
        <p className="rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-700">
          目前沒有持股，新增成分股後即可查看配置與風險分析。
        </p>
      ) : isLoading ? (
        <p role="status" className="rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-3 text-xs text-slate-600">
          正在根據成分股、產業配置與歷史回測數據產生診斷…
        </p>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-800">
          <span>診斷載入失敗：{error}</span>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100"
          >
            重新嘗試
          </button>
        </div>
      ) : diagnosis ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-2">
                <Lightbulb className="w-3.5 h-3.5" /> 優勢洞察（Pros）
              </h3>
              <ul className="space-y-2 text-xs leading-relaxed text-emerald-900">
                {diagnosis.pros.map((item, index) => (
                  <li key={`${index}-${item}`} className="flex items-start gap-2">
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-2">
                <AlertTriangle className="w-3.5 h-3.5" /> 風險洞察（Cons）
              </h3>
              <ul className="space-y-2 text-xs leading-relaxed text-amber-950">
                {diagnosis.cons.map((item, index) => (
                  <li key={`${index}-${item}`} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-sm">
            <h3 className="mb-1.5 flex items-center gap-2 text-xs font-bold text-indigo-900">
              <span aria-hidden="true">🤖</span>
              AI 總結與行動建議
            </h3>
            <p className="text-sm leading-relaxed text-indigo-950">{diagnosis.summary}</p>
          </div>
        </>
      ) : null}

      <p className="text-[11px] text-slate-400">
        分析依目前配置、所選區間與可取得的真實還原權息行情產生，僅供參考，非投資建議；歷史表現不代表未來結果。
      </p>
    </section>
  );
};
