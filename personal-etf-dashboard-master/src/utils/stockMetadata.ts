import stockList from '../data/twStockList.json';

export interface TaiwanStockMetadata {
  symbol: string;
  code: string;
  name: string;
  market: 'TWSE' | 'TPEx';
  industry: string;
  sector: string;
  exchange: 'TW' | 'TWO';
  aliases?: string[];
}

interface OfficialStockRecord {
  symbol: string;
  code: string;
  name: string;
  market: 'TWSE' | 'TPEx';
  industry: string;
}

const sectorOverrides: Record<string, string> = {
  '2330': '晶圓代工',
  '2303': '晶圓代工',
  '5347': '晶圓代工',
  '6770': '晶圓代工',
  '2454': 'IC 設計',
  '2379': 'IC 設計',
  '3034': 'IC 設計',
  '3035': 'IC 設計',
  '5274': 'IC 設計',
  '4966': 'IC 設計',
  '3661': 'IC 設計',
  '6533': 'IC 設計',
  '6415': 'IC 設計',
  '3711': '半導體封測',
  '6239': '半導體封測',
  '2449': '半導體封測',
  '3264': '半導體封測',
  '6257': '半導體封測',
  '8150': '半導體封測',
  '3081': 'CPO 光通訊',
  '3163': 'CPO 光通訊',
  '6442': 'CPO 光通訊',
  '4979': 'CPO 光通訊',
  '3363': 'CPO 光通訊',
  '4908': 'CPO 光通訊',
  '2308': '電源與散熱',
  '3017': '電源與散熱',
  '3324': '電源與散熱',
  '3653': '電源與散熱',
  '2421': '電源與散熱',
  '6230': '電源與散熱',
  '2382': 'AI 伺服器與組裝',
  '3231': 'AI 伺服器與組裝',
  '6669': 'AI 伺服器與組裝',
  '2356': 'AI 伺服器與組裝',
  '2317': 'AI 伺服器與組裝',
  '2376': 'AI 伺服器與組裝',
  '4938': 'AI 伺服器與組裝',
  '3706': 'AI 伺服器與組裝',
  '2049': '精密機械/設備',
  '1590': '精密機械/設備',
  '3131': 'CoWoS 設備',
  '4576': '精密機械/設備',
  '3583': 'CoWoS 設備',
  '3680': 'CoWoS 設備',
  '6196': '精密機械/設備',
  '2383': 'CCL 銅箔基板',
  '6274': 'CCL 銅箔基板',
  '6213': 'CCL 銅箔基板',
  '3481': '面板',
  '2409': '面板',
  '6116': '面板',
  '2881': '金融保險業',
  '2882': '金融保險業',
  '2891': '金融保險業',
  '2886': '金融保險業',
  '2880': '金融保險業',
  '2884': '金融保險業',
  '2885': '金融保險業',
  '2892': '金融保險業',
  '5880': '金融保險業',
  '0050': '市值型 ETF',
  '00631L': '市值/槓桿型 ETF',
  '0056': '高股息 ETF',
  '00878': '高股息 ETF',
  '00919': '高股息 ETF',
  '00929': '高股息 ETF',
  '00713': '高股息 ETF',
  '00918': '高股息 ETF',
  '00915': '高股息 ETF',
};

const aliasesByCode: Record<string, string[]> = {
  '2330': ['台灣積體電路'],
  '2454': ['聯發科技'],
  '3661': ['世芯'],
  '6415': ['矽力'],
  '3711': ['日月光'],
  '6239': ['力成科技'],
  '2308': ['台達電子'],
  '1590': ['亞德客'],
};

const normalizeName = (value: string) => value.replace(/\s+/g, '').toLocaleUpperCase();
const tickerBase = (symbol: string) => symbol.trim().toUpperCase().replace(/\.(TW|TWO)$/, '');

export const TAIWAN_STOCKS: TaiwanStockMetadata[] = (stockList as OfficialStockRecord[]).map((stock) => ({
  ...stock,
  sector: sectorOverrides[stock.code] || stock.industry || '未分類',
  exchange: stock.market === 'TWSE' ? 'TW' : 'TWO',
  aliases: aliasesByCode[stock.code],
}));

export function searchTaiwanStocks(query: string): TaiwanStockMetadata[] {
  const clean = query.trim();
  if (!clean) return [];
  const base = tickerBase(clean);
  const key = normalizeName(clean);
  const matches = TAIWAN_STOCKS.filter((stock) => {
    const names = [stock.name, ...(stock.aliases || [])].map(normalizeName);
    return stock.code === base || names.some((name) => name.includes(key));
  });

  return matches.sort((left, right) => {
    const rank = (stock: TaiwanStockMetadata) => {
      if (stock.code === base || stock.symbol.toUpperCase() === clean.toUpperCase()) return 0;
      if ([stock.name, ...(stock.aliases || [])].some((name) => normalizeName(name) === key)) return 1;
      if ([stock.name, ...(stock.aliases || [])].some((name) => normalizeName(name).startsWith(key))) return 2;
      return 3;
    };
    return rank(left) - rank(right) || left.code.localeCompare(right.code, 'en', { numeric: true });
  });
}

export function findTaiwanStock(query: string): TaiwanStockMetadata | undefined {
  return searchTaiwanStocks(query)[0];
}

export function getStockSector(symbol: string, name = '', fallbackSector?: string): string {
  const known = findTaiwanStock(symbol) || findTaiwanStock(name);
  if (known) return known.sector;

  const description = `${name} ${fallbackSector || ''}`;
  const keywordSectors: Array<[RegExp, string]> = [
    [/NVDA|輝達|AI\s*晶片|GPU|AI\s*算力/i, 'AI 晶片與算力'],
    [/AAPL|蘋果|消費電子/i, '消費電子'],
    [/MSFT|微軟|雲端|企業軟體/i, '雲端與企業軟體'],
    [/IC\s*設計|晶片設計|聯發科|瑞昱|聯詠|晶心科|矽力/i, 'IC 設計'],
    [/晶圓代工|晶圓製造|台積電|聯電|世界先進|力積電/i, '晶圓代工'],
    [/封測|日月光|京元電子|欣銓|矽格|南茂/i, '半導體封測'],
    [/光通訊|光纖|聯亞|光聖|華星光|上詮/i, '光通訊'],
    [/電源|散熱|電源供應|奇鋐|雙鴻|健策|台達電/i, '電源與散熱'],
    [/AI\s*伺服器|伺服器|電子代工|廣達|緯創|緯穎|英業達|鴻海|技嘉/i, 'AI 伺服器與組裝'],
    [/精密機械|工具機|設備|上銀|亞德客|弘塑|辛耘|家登/i, '精密機械/設備'],
    [/金融|金控|銀行|保險|富邦金|國泰金|中信金|兆豐金/i, '金融保險業'],
    [/高股息|高息|高股利/i, '高股息 ETF'],
    [/ETF|指數型/i, '市值型 ETF'],
  ];

  const match = keywordSectors.find(([pattern]) => pattern.test(description));
  if (match) return match[1];
  if (/Semiconductor|半導體/i.test(description)) return '半導體業';
  if (/Electronic|電子零組件|電子/i.test(description)) return '電子零組件業';
  if (/Computer|電腦|伺服器/i.test(description)) return '電腦及週邊設備業';
  if (/Technology|科技|光通訊|網通/i.test(description) || /\.TWO$/i.test(symbol)) return '其他電子業';
  return fallbackSector || '其他業';
}

export function normalizeStockSymbol(symbol: string, stock?: TaiwanStockMetadata): string {
  const clean = symbol.trim().toUpperCase();
  if (!/^\d{4,6}[A-Z]?$/.test(clean)) return clean;
  const known = stock || findTaiwanStock(clean);
  return `${clean}.${known?.exchange || 'TW'}`;
}
