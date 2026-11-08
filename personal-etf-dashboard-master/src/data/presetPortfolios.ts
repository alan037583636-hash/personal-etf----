import type { PortfolioHolding } from '../types/etf';

export const PRESET_PORTFOLIOS: Array<{
  id: string;
  name: string;
  description: string;
  holdings: PortfolioHolding[];
}> = [
  {
    id: 'tech_giants',
    name: '台灣科技領航 (預設)',
    description: '以台積電與聯發科為核心的旗艦半導體與電子代工配置',
    holdings: [
      { id: '1', symbol: '2330.TW', name: '台積電', weight: 35, sector: '半導體製造', color: '#3b82f6' },
      { id: '2', symbol: '2454.TW', name: '聯發科', weight: 25, sector: 'IC 設計', color: '#8b5cf6' },
      { id: '3', symbol: '2317.TW', name: '鴻海', weight: 20, sector: '電子代工/電動車', color: '#06b6d4' },
      { id: '4', symbol: '2382.TW', name: '廣達', weight: 20, sector: 'AI 伺服器', color: '#f59e0b' },
    ],
  },
  {
    id: 'ai_supercycle',
    name: 'AI 算力狂潮鏈',
    description: '聚焦伺服器代工、散熱模組與全球算力龍頭的高成長配置',
    holdings: [
      { id: '1', symbol: 'NVDA', name: '輝達 (NVIDIA)', weight: 30, sector: 'AI 晶片', color: '#76b900' },
      { id: '2', symbol: '2330.TW', name: '台積電', weight: 30, sector: '先進製程', color: '#3b82f6' },
      { id: '3', symbol: '2382.TW', name: '廣達', weight: 20, sector: 'AI 伺服器', color: '#f59e0b' },
      { id: '4', symbol: '3017.TW', name: '奇鋐', weight: 20, sector: '散熱模組', color: '#14b8a6' },
    ],
  },
  {
    id: 'balanced_fortress',
    name: '穩健成長護城河',
    description: '半導體龍頭搭配頂級金控與綠能電源，兼具防禦與成長',
    holdings: [
      { id: '1', symbol: '2330.TW', name: '台積電', weight: 35, sector: '半導體製造', color: '#3b82f6' },
      { id: '2', symbol: '2881.TW', name: '富邦金', weight: 25, sector: '金控金融', color: '#ec4899' },
      { id: '3', symbol: '2308.TW', name: '台達電', weight: 25, sector: '電源與綠能', color: '#10b981' },
      { id: '4', symbol: '2317.TW', name: '鴻海', weight: 15, sector: '電子代工', color: '#06b6d4' },
    ],
  },
  {
    id: 'global_tech_titans',
    name: '全球科技三巨頭',
    description: '結合全球頂級科技霸權微軟、蘋果與台積電',
    holdings: [
      { id: '1', symbol: '2330.TW', name: '台積電', weight: 40, sector: '晶圓代工', color: '#3b82f6' },
      { id: '2', symbol: 'MSFT', name: '微軟', weight: 30, sector: '雲端/AI', color: '#0284c7' },
      { id: '3', symbol: 'AAPL', name: '蘋果', weight: 30, sector: '消費終端', color: '#64748b' },
    ],
  },
];
