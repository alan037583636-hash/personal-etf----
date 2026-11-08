export interface TaiwanStockMetadata {
  code: string;
  name: string;
  sector: string;
  exchange?: 'TW' | 'TWO';
  aliases?: string[];
}

export const TAIWAN_STOCKS: TaiwanStockMetadata[] = [
  { code: '2330', name: '台積電', sector: '晶圓代工', aliases: ['台灣積體電路'] },
  { code: '2454', name: '聯發科', sector: 'IC 設計' },
  { code: '2379', name: '瑞昱', sector: 'IC 設計' },
  { code: '3034', name: '聯詠', sector: 'IC 設計' },
  { code: '3035', name: '智原', sector: 'IC 設計' },
  { code: '5274', name: '信驊', sector: 'IC 設計' },
  { code: '4966', name: '譜瑞-KY', sector: 'IC 設計' },
  { code: '3661', name: '世芯-KY', sector: 'IC 設計', aliases: ['世芯'] },
  { code: '6533', name: '晶心科', sector: 'IC 設計' },
  { code: '6415', name: '矽力*-KY', sector: 'IC 設計', aliases: ['矽力'] },
  { code: '2303', name: '聯電', sector: '晶圓代工' },
  { code: '5347', name: '世界先進', sector: '晶圓代工', exchange: 'TWO' },
  { code: '6770', name: '力積電', sector: '晶圓代工' },
  { code: '3711', name: '日月光投控', sector: '半導體封測', aliases: ['日月光'] },
  { code: '2449', name: '京元電子', sector: '半導體封測' },
  { code: '3264', name: '欣銓', sector: '半導體封測', exchange: 'TWO' },
  { code: '6257', name: '矽格', sector: '半導體封測' },
  { code: '8150', name: '南茂', sector: '半導體封測' },
  { code: '3081', name: '聯亞', sector: '光通訊', exchange: 'TWO' },
  { code: '6442', name: '光聖', sector: '光通訊' },
  { code: '4979', name: '華星光', sector: '光通訊', exchange: 'TWO' },
  { code: '3363', name: '上詮', sector: '光通訊', exchange: 'TWO' },
  { code: '4908', name: '前鼎', sector: '光通訊' },
  { code: '2308', name: '台達電', sector: '電源與散熱', aliases: ['台達電子'] },
  { code: '3017', name: '奇鋐', sector: '電源與散熱' },
  { code: '3324', name: '雙鴻', sector: '電源與散熱', exchange: 'TWO' },
  { code: '3653', name: '健策', sector: '電源與散熱' },
  { code: '2421', name: '建準', sector: '電源與散熱' },
  { code: '6230', name: '尼得科超眾', sector: '電源與散熱' },
  { code: '2382', name: '廣達', sector: 'AI 伺服器與組裝' },
  { code: '3231', name: '緯創', sector: 'AI 伺服器與組裝' },
  { code: '6669', name: '緯穎', sector: 'AI 伺服器與組裝' },
  { code: '2356', name: '英業達', sector: 'AI 伺服器與組裝' },
  { code: '2317', name: '鴻海', sector: 'AI 伺服器與組裝' },
  { code: '2376', name: '技嘉', sector: 'AI 伺服器與組裝' },
  { code: '4938', name: '和碩', sector: 'AI 伺服器與組裝' },
  { code: '3706', name: '神達', sector: 'AI 伺服器與組裝' },
  { code: '2049', name: '上銀', sector: '精密機械/設備' },
  { code: '1590', name: '亞德客-KY', sector: '精密機械/設備', aliases: ['亞德客'] },
  { code: '3131', name: '弘塑', sector: '精密機械/設備' },
  { code: '3583', name: '辛耘', sector: '精密機械/設備' },
  { code: '3680', name: '家登', sector: '精密機械/設備' },
  { code: '6196', name: '帆宣', sector: '精密機械/設備' },
  { code: '2881', name: '富邦金', sector: '金融' },
  { code: '2882', name: '國泰金', sector: '金融' },
  { code: '2891', name: '中信金', sector: '金融' },
  { code: '2886', name: '兆豐金', sector: '金融' },
  { code: '2880', name: '華南金', sector: '金融' },
  { code: '2884', name: '玉山金', sector: '金融' },
  { code: '2885', name: '元大金', sector: '金融' },
  { code: '2892', name: '第一金', sector: '金融' },
  { code: '5880', name: '合庫金', sector: '金融' },
  { code: '0050', name: '元大台灣50', sector: '市值型 ETF' },
  { code: '0056', name: '元大高股息', sector: '高股息 ETF' },
  { code: '00878', name: '國泰永續高股息', sector: '高股息 ETF' },
  { code: '00919', name: '群益台灣精選高息', sector: '高股息 ETF' },
  { code: '00929', name: '復華台灣科技優息', sector: '高股息 ETF' },
  { code: '00713', name: '元大台灣高息低波', sector: '高股息 ETF' },
  { code: '00918', name: '大華優利高填息30', sector: '高股息 ETF' },
  { code: '00915', name: '凱基優選高股息30', sector: '高股息 ETF' },
];

const nameKey = (value: string) => value.replace(/\s+/g, '').toLocaleUpperCase();
const tickerBase = (symbol: string) => symbol.trim().toUpperCase().replace(/\.(TW|TWO)$/, '');

export function findTaiwanStock(query: string): TaiwanStockMetadata | undefined {
  const clean = query.trim();
  if (!clean) return undefined;
  const base = tickerBase(clean);

  const byCode = TAIWAN_STOCKS.find((stock) => stock.code === base);
  if (byCode) return byCode;

  const key = nameKey(clean);
  return TAIWAN_STOCKS.find(
    (stock) =>
      [stock.name, ...(stock.aliases || [])].some((name) => nameKey(name) === key)
  );
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
    [/金融|金控|銀行|保險|富邦金|國泰金|中信金|兆豐金/i, '金融'],
    [/高股息|高息|高股利/i, '高股息 ETF'],
    [/ETF|指數型/i, '市值型 ETF'],
  ];

  const match = keywordSectors.find(([pattern]) => pattern.test(description));
  if (match) return match[1];
  if (/\.TWO$/i.test(symbol) || /電子|半導體|科技|光通訊|電腦|網通/i.test(description)) {
    return '其他電子';
  }
  return '其他傳產';
}

export function normalizeStockSymbol(symbol: string, stock?: TaiwanStockMetadata): string {
  const clean = symbol.trim().toUpperCase();
  if (!/^\d{4,6}$/.test(clean)) return clean;
  const known = stock || findTaiwanStock(clean);
  return `${clean}.${known?.exchange || 'TW'}`;
}
