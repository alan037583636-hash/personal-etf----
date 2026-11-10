import React from 'react';
import { PerformanceMetrics, RebalanceMode, RiskMetrics } from '../types/etf';
import { Info } from 'lucide-react';

interface MetricsCardsProps {
  metrics: PerformanceMetrics;
  rangeLabel: string;
  rebalanceMode: RebalanceMode;
  benchmarkSymbol: string;
  todayChange: number | null;
  todayChangePercent: number | null;
  riskMetrics: RiskMetrics;
  hasMarketData: boolean;
}

interface MetricHelpProps {
  label: string;
  description: string;
}

const MetricHelp: React.FC<MetricHelpProps> = ({ label, description }) => (
  <div className="relative group inline-flex shrink-0 items-center">
    <button
      type="button"
      aria-label={`查看${label}說明`}
      className="text-gray-400 hover:text-gray-600 cursor-help transition-colors"
    >
      <Info className="w-3.5 h-3.5" />
    </button>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-30 w-56 p-2 bg-gray-900 text-white text-[11px] leading-relaxed rounded-md shadow-lg pointer-events-none">
      {description}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
    </div>
  </div>
);

function returnColorClass(value: number): string {
  if (value > 0) return 'text-red-600';
  if (value < 0) return 'text-green-600';
  return 'text-gray-700';
}

function formatReturn(value: number | undefined): string {
  if (value === undefined) return '--';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function SubMetric({
  label,
  value,
  valueClassName = 'text-gray-700',
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between items-center text-sm border-t border-gray-100 pt-2 mt-4">
      <span className="text-gray-500">{label}</span>
      <span className={`font-mono font-semibold tabular-nums text-right ${valueClassName}`}>{value}</span>
    </div>
  );
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  metrics,
  rangeLabel,
  rebalanceMode,
  benchmarkSymbol,
  todayChange,
  todayChangePercent,
  riskMetrics,
  hasMarketData,
}) => {
  const dailyChangeColor = todayChangePercent === null
    ? 'text-gray-700'
    : returnColorClass(todayChangePercent);
  const benchmarkReturn = hasMarketData ? metrics.benchmarkRangeReturn : undefined;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <article className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-500">淨值 (NAV)</h2>
          <span className="text-xs text-gray-500">基期 10.00 元</span>
        </div>
        <div className="mt-4 text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums text-gray-900">
          {hasMarketData ? `${metrics.currentNav.toFixed(2)} 元` : '--'}
        </div>
        <div className="mt-auto">
          <SubMetric
            label="最新日漲跌"
            value={todayChange === null || todayChangePercent === null
              ? '資料不足'
              : `${todayChange > 0 ? '+' : ''}${todayChange.toFixed(2)} 元 (${formatReturn(todayChangePercent)})`}
            valueClassName={dailyChangeColor}
          />
        </div>
      </article>

      <article className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-500">{rangeLabel} 累積報酬</h2>
        </div>
        <div className={`mt-4 text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums ${hasMarketData ? returnColorClass(metrics.rangeReturn) : 'text-gray-700'}`}>
          {hasMarketData ? formatReturn(metrics.rangeReturn) : '--'}
        </div>
        <div className="mt-auto">
          <SubMetric
            label={`對比大盤 (${benchmarkSymbol})`}
            value={formatReturn(benchmarkReturn)}
            valueClassName={benchmarkReturn === undefined ? 'text-gray-700' : returnColorClass(benchmarkReturn)}
          />
          <SubMetric
            label={<>Beta <span className="text-xs">(0050.TW)</span></>}
            value={riskMetrics.beta === null ? '資料不足' : riskMetrics.beta.toFixed(2)}
          />
        </div>
      </article>

      <article className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-500">{rangeLabel} 年化報酬 (CAGR)</h2>
          <MetricHelp label="CAGR" description="衡量每年平均的複利增長率。" />
        </div>
        <div className={`mt-4 text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums ${hasMarketData ? returnColorClass(metrics.cagr) : 'text-gray-700'}`}>
          {hasMarketData ? formatReturn(metrics.cagr) : '--'}
        </div>
        <div className="mt-auto">
          <SubMetric
            label="回測模式"
            value={rebalanceMode === 'quarterly_rebalance' ? '每季再平衡' : '買進持有'}
          />
          <SubMetric
            label={<>夏普值 <span className="text-xs">(Sharpe Ratio)</span></>}
            value={riskMetrics.sharpeRatio === null ? '資料不足' : riskMetrics.sharpeRatio.toFixed(2)}
          />
        </div>
      </article>

      <article className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-500">{rangeLabel} 風險控管</h2>
          <MetricHelp
            label="MDD"
            description="這段期間內淨值從最高點跌至最低點的最大跌幅，衡量下檔風險。"
          />
        </div>
        <div className="mt-4 text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums text-gray-900">
          {hasMarketData ? `-${metrics.maxDrawdown.toFixed(2)}%` : '--'}
        </div>
        <div className="mt-auto">
          <SubMetric
            label="區間最低價"
            value={hasMarketData ? `${metrics.rangeLow.toFixed(2)} 元` : '--'}
          />
          <SubMetric
            label={
              <>
                年化波動度
                <MetricHelp
                  label="年化波動度"
                  description="區間每日報酬率標準差乘以 √252，衡量年化價格波動。"
                />
              </>
            }
            value={riskMetrics.annualizedVolatility === null
              ? '資料不足'
              : `${(riskMetrics.annualizedVolatility * 100).toFixed(2)}%`}
          />
        </div>
      </article>
    </div>
  );
};
