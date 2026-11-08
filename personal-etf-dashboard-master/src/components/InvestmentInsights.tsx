import React, { useMemo } from 'react';
import { AlertTriangle, BarChart3, Lightbulb } from 'lucide-react';
import { PerformanceMetrics, PortfolioHolding, RealDataApiResponse, RiskMetrics } from '../types/etf';
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

export const InvestmentInsights: React.FC<InvestmentInsightsProps> = ({
  holdings,
  realData,
  metrics,
  riskMetrics,
}) => {
  const analysis = useMemo(() => {
    const totalWeight = holdings.reduce((sum, holding) => sum + (Number(holding.weight) || 0), 0);
    const sectors = new Map<string, number>();
    for (const holding of holdings) {
      const sector = getStockSector(holding.symbol, holding.name, holding.sector);
      sectors.set(sector, (sectors.get(sector) || 0) + (Number(holding.weight) || 0));
    }

    const sectorConcentrations = Array.from(sectors.entries())
      .map(([sector, weight]) => ({
        sector,
        percent: totalWeight > 0 ? (weight / totalWeight) * 100 : 0,
      }))
      .sort((left, right) => right.percent - left.percent);
    const rankedHoldings = [...holdings].sort((left, right) => right.weight - left.weight);
    const performances = holdings
      .map((holding) => getRecentPerformance(holding, realData))
      .filter((performance): performance is HoldingPerformance => performance !== null);
    const performanceWeight = performances.reduce((sum, item) => sum + item.weight, 0);
    const weightedReturn = performanceWeight > 0
      ? performances.reduce((sum, item) => sum + item.returnPercent * item.weight, 0) / performanceWeight
      : null;

    return { sectorConcentrations, rankedHoldings, performances, weightedReturn, totalWeight };
  }, [holdings, realData]);

  const topHolding = analysis.rankedHoldings[0];
  const topSector = analysis.sectorConcentrations[0];
  const hasMarketData = Boolean(realData?.tradingDates.length && Object.keys(realData.stocks).length);
  const pros: string[] = [];
  const risks: string[] = [];

  if (holdings.length > 0 && topHolding) {
    pros.push(
      `目前配置包含 ${holdings.length} 檔標的，最大部位為${topHolding.name}（${topHolding.weight}%）；持股與權重明確，便於追蹤配置變化。`
    );
    risks.push(
      `${topHolding.name} 佔配置 ${topHolding.weight}%，${topHolding.weight >= 50 ? '單一標的集中度高，價格波動對組合影響明顯' : '仍是最大單一部位，個股事件可能影響組合'}。`
    );
  }

  if (holdings.length > 0) {
    const returnText = `${metrics.cagr >= 0 ? '+' : ''}${metrics.cagr.toFixed(2)}%`;
    pros.push(
      hasMarketData && Number.isFinite(metrics.cagr)
        ? `目前選取區間年化報酬率（CAGR）為 ${returnText}，可直接與其他配置期間績效比較。`
        : '目前診斷依持股名稱、配置權重及產業分類即時計算；取得完整真實行情後會納入歷史績效比較。'
    );
    risks.push(
      hasMarketData && Number.isFinite(metrics.maxDrawdown)
        ? `目前選取區間最大回撤為 -${metrics.maxDrawdown.toFixed(2)}%；歷史回撤反映下跌期間可能承受的資產縮水。`
        : '目前尚無足夠歷史行情計算最大回撤，暫時無法量化下跌風險。'
    );
  }

  if (topSector) {
    pros.push(
      `產業曝險以${topSector.sector}為主（${topSector.percent.toFixed(0)}%），且涵蓋 ${analysis.sectorConcentrations.length} 個產業類別，可清楚掌握投資主題。`
    );
  } else if (topHolding) {
    pros.push(`${topHolding.name}（${topHolding.symbol}）目前配置 ${topHolding.weight}%，可直接追蹤其對組合報酬的影響。`);
  }

  if (riskMetrics.annualizedVolatility !== null) {
    risks.push(
      `選取區間年化波動度為 ${(riskMetrics.annualizedVolatility * 100).toFixed(2)}%` +
      (riskMetrics.sharpeRatio === null ? '，請留意日常價格起伏。' :
        `，夏普值 ${riskMetrics.sharpeRatio.toFixed(2)}；波動及風險調整後表現會隨區間變動。`)
    );
  } else {
    const missingNames = holdings
      .filter((holding) => !analysis.performances.some((item) => item.name === holding.name))
      .map((holding) => holding.name || holding.symbol);
    risks.push(
      missingNames.length
        ? `尚無完整日行情可計算組合波動度，${missingNames.slice(0, 3).join('、')}的個股風險指標未能涵蓋。`
        : '目前區間的有效日報酬不足，無法可靠估算年化波動度與夏普值。'
    );
  }

  if (analysis.weightedReturn !== null && analysis.performances.length > 0) {
    pros.push(
      `近約 3 個月可取得還原權息行情的成分股加權報酬為 ${analysis.weightedReturn >= 0 ? '+' : ''}${analysis.weightedReturn.toFixed(2)}%。`
    );
  }

  if (analysis.totalWeight !== 100) {
    risks.push(`目前持股權重合計 ${analysis.totalWeight}%，與 100% 相差 ${Math.abs(100 - analysis.totalWeight)} 個百分點；回測會按有效權重比例標準化。`);
  } else if (topSector) {
    risks.push(`${topSector.sector}佔產業曝險 ${topSector.percent.toFixed(0)}%，若該產業同步修正，可能對組合造成較大影響。`);
  }

  const summary = holdings.length && hasMarketData
    ? `本地即時分析：${holdings.length} 檔持股，區間 CAGR ${metrics.cagr.toFixed(2)}%、MDD -${metrics.maxDrawdown.toFixed(2)}%。分析依可取得的真實行情及目前權重計算；歷史表現不代表未來結果。`
    : holdings.length
      ? `本地即時分析：${holdings.length} 檔持股，行情尚未載入，因此不顯示假造的績效數值；目前分析持股權重與產業曝險。`
      : '目前沒有持股，新增成分股後即可查看配置與風險分析。';

  return (
    <section className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-700" />
          <h2 className="text-sm font-bold text-slate-900">📊 投資組合即時診斷</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            前端即時精算
          </span>
        </div>
      </div>

      <p className="rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-700">
        {summary}
      </p>

      {holdings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3.5">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-2">
              <Lightbulb className="w-3.5 h-3.5" /> 近期潛在優勢（Pros）
            </h3>
            <ul className="space-y-1.5 text-xs leading-relaxed text-emerald-900">
              {pros.slice(0, 4).map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>

          <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3.5">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> 風險警語（Risks / Cons）
            </h3>
            <ul className="space-y-1.5 text-xs leading-relaxed text-amber-950">
              {risks.slice(0, 4).map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        分析依目前配置、所選區間與可取得的真實還原權息行情自動計算，僅供參考，非投資建議；歷史表現不代表未來結果。
      </p>
    </section>
  );
};
