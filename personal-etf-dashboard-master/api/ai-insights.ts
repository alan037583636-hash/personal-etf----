import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withJsonError } from './utils/withJsonError.ts';

type InsightProvider = 'Gemini' | 'Groq' | 'OpenRouter' | '內建規則';

interface InsightHolding {
  symbol: string;
  name: string;
  weight: number;
  sector: string;
}

interface InsightInput {
  holdings: InsightHolding[];
  sectors: Array<{ sector: string; percent: number }>;
  recentPerformance: Array<{ name: string; weight: number; returnPercent: number; annualizedVolatility: number }>;
  market: { changePercent: number | null; latestDate: string | null };
  metrics: { currentNav: number; cagr: number; maxDrawdown: number; allTimeReturn: number };
}

interface InsightResponse {
  summary: string;
  pros: string[];
  risks: string[];
  provider: InsightProvider;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeText(value: unknown, maxLength = 100): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function parseInput(value: Record<string, unknown>): InsightInput | null {
  if (!Array.isArray(value.holdings) || !Array.isArray(value.sectors) ||
      !Array.isArray(value.recentPerformance) || !isRecord(value.metrics) || !isRecord(value.market)) {
    return null;
  }

  const holdings = value.holdings.slice(0, 50).flatMap((item) => {
    if (!isRecord(item)) return [];
    const weight = finiteNumber(item.weight);
    const symbol = safeText(item.symbol, 16);
    const name = safeText(item.name);
    if (weight === null || !symbol || !name) return [];
    return [{ symbol, name, weight, sector: safeText(item.sector) || '未分類' }];
  });
  const sectors = value.sectors.slice(0, 50).flatMap((item) => {
    if (!isRecord(item)) return [];
    const percent = finiteNumber(item.percent);
    const sector = safeText(item.sector);
    return percent === null || !sector ? [] : [{ sector, percent }];
  });
  const recentPerformance = value.recentPerformance.slice(0, 50).flatMap((item) => {
    if (!isRecord(item)) return [];
    const weight = finiteNumber(item.weight);
    const returnPercent = finiteNumber(item.returnPercent);
    const annualizedVolatility = finiteNumber(item.annualizedVolatility);
    const name = safeText(item.name);
    if (weight === null || returnPercent === null || annualizedVolatility === null || !name) return [];
    return [{ name, weight, returnPercent, annualizedVolatility }];
  });

  const currentNav = finiteNumber(value.metrics.currentNav);
  const cagr = finiteNumber(value.metrics.cagr);
  const maxDrawdown = finiteNumber(value.metrics.maxDrawdown);
  const allTimeReturn = finiteNumber(value.metrics.allTimeReturn);
  const changePercent = value.market.changePercent === null
    ? null
    : finiteNumber(value.market.changePercent);
  if (currentNav === null || cagr === null || maxDrawdown === null || allTimeReturn === null ||
      (value.market.changePercent !== null && changePercent === null)) {
    return null;
  }

  return {
    holdings,
    sectors,
    recentPerformance,
    market: {
      changePercent,
      latestDate: typeof value.market.latestDate === 'string' ? value.market.latestDate.slice(0, 10) : null,
    },
    metrics: { currentNav, cagr, maxDrawdown, allTimeReturn },
  };
}

function parseInsight(text: string, provider: InsightProvider): InsightResponse {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!isRecord(parsed) || typeof parsed.summary !== 'string' ||
      !Array.isArray(parsed.pros) || !Array.isArray(parsed.risks)) {
    throw new Error(`${provider} 回傳格式不符合預期`);
  }
  const pros = parsed.pros.filter((item): item is string => typeof item === 'string').slice(0, 6);
  const risks = parsed.risks.filter((item): item is string => typeof item === 'string').slice(0, 6);
  if (!parsed.summary.trim() || pros.length === 0 || risks.length === 0) {
    throw new Error(`${provider} 回傳內容不完整`);
  }
  return { summary: parsed.summary.trim(), pros, risks, provider };
}

function createRuleBasedInsight(input: InsightInput): InsightResponse {
  const topSector = input.sectors[0];
  const bestPerformer = input.recentPerformance.reduce<(typeof input.recentPerformance)[number] | null>(
    (best, item) => !best || item.returnPercent > best.returnPercent ? item : best,
    null
  );
  const summaryParts = [
    `目前組合淨值 ${input.metrics.currentNav.toFixed(2)} 元，5 年 CAGR 約 ${input.metrics.cagr.toFixed(2)}%。`,
  ];
  if (topSector) summaryParts.push(`權重最高的產業為${topSector.sector}（${topSector.percent.toFixed(1)}%）。`);

  const pros = [
    bestPerformer
      ? `${bestPerformer.name}近期觀察區間報酬 ${bestPerformer.returnPercent >= 0 ? '+' : ''}${bestPerformer.returnPercent.toFixed(1)}%，為目前可取得資料中表現較佳的成分股。`
      : '目前成分股資料已提供配置基礎，建議持續追蹤各標的及產業變化。',
  ];
  if (input.metrics.cagr > 0) pros.push(`歷史 5 年 CAGR 為正（${input.metrics.cagr.toFixed(2)}%），但不代表未來報酬。`);
  if (input.market.changePercent !== null) {
    pros.push(`台灣加權指數近約 3 個月變動 ${input.market.changePercent >= 0 ? '+' : ''}${input.market.changePercent.toFixed(2)}%。`);
  }

  const risks = [`5 年最大回撤約 ${input.metrics.maxDrawdown.toFixed(2)}%，市場下跌時淨值仍可能有明顯波動。`];
  if (topSector && topSector.percent >= 35) {
    risks.push(`${topSector.sector}權重約 ${topSector.percent.toFixed(1)}%，產業集中可能放大相關供應鏈風險。`);
  }
  if (input.recentPerformance.some((item) => item.annualizedVolatility >= 45)) {
    risks.push('部分成分股近期年化波動度偏高，請留意短期價格起伏。');
  }
  return { summary: summaryParts.join(''), pros, risks, provider: '內建規則' };
}

function createPrompt(input: InsightInput): string {
  return [
    '你是審慎、專業的 ETF 組合分析助理。請只根據提供資料，以繁體中文撰寫，不可捏造市場事實或保證報酬。',
    '請只回傳 JSON，不要 Markdown，格式為 {"summary":"整體評語","pros":["近期潛在優勢"],"risks":["近期風險警語"]}。',
    'pros 與 risks 各至少 1 項，語氣客觀，並提醒歷史績效不代表未來結果。',
    '投資組合資料：',
    JSON.stringify(input),
  ].join('\n');
}

async function requestWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const response = await requestWithTimeout(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini 回傳 HTTP ${response.status}`);
  const result: unknown = await response.json();
  if (!isRecord(result) || !Array.isArray(result.candidates)) throw new Error('Gemini 回傳內容缺少候選結果');
  const first = result.candidates[0];
  const parts = isRecord(first) && isRecord(first.content) ? first.content.parts : undefined;
  if (!Array.isArray(parts) || !isRecord(parts[0]) || typeof parts[0].text !== 'string') {
    throw new Error('Gemini 回傳內容格式錯誤');
  }
  return parts[0].text;
}

async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  provider: 'Groq' | 'OpenRouter'
): Promise<string> {
  const response = await requestWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(provider === 'OpenRouter' ? { 'X-Title': 'Personal ETF Dashboard' } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '請依指示以繁體中文回傳有效 JSON。' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    }),
  });
  if (!response.ok) throw new Error(`${provider} 回傳 HTTP ${response.status}`);
  const result: unknown = await response.json();
  if (!isRecord(result) || !Array.isArray(result.choices)) throw new Error(`${provider} 回傳內容缺少候選結果`);
  const choice = result.choices[0];
  const message = isRecord(choice) ? choice.message : undefined;
  if (!isRecord(message) || typeof message.content !== 'string') throw new Error(`${provider} 回傳內容格式錯誤`);
  return message.content;
}

async function handleAiInsights(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '僅支援 POST 請求。' });
  }

  if (!isRecord(req.body)) {
    return res.status(400).json({ success: false, error: '請提供有效的診斷資料。' });
  }
  if (JSON.stringify(req.body).length > 24000) {
    return res.status(413).json({ success: false, error: '診斷資料超過允許大小。' });
  }

  const input = parseInput(req.body);
  if (!input) {
    return res.status(400).json({ success: false, error: '診斷資料欄位不完整。' });
  }

  const prompt = createPrompt(input);
  const providers: Array<{ name: 'Gemini' | 'Groq' | 'OpenRouter'; key?: string; run: () => Promise<string> }> = [
    {
      name: 'Gemini',
      key: process.env.GEMINI_API_KEY,
      run: () => callGemini(process.env.GEMINI_API_KEY || '', prompt),
    },
    {
      name: 'Groq',
      key: process.env.GROQ_API_KEY,
      run: () => callOpenAiCompatible(
        'https://api.groq.com/openai/v1',
        process.env.GROQ_API_KEY || '',
        'llama-3.3-70b-versatile',
        prompt,
        'Groq'
      ),
    },
    {
      name: 'OpenRouter',
      key: process.env.OPENROUTER_API_KEY,
      run: () => callOpenAiCompatible(
        'https://openrouter.ai/api/v1',
        process.env.OPENROUTER_API_KEY || '',
        'meta-llama/llama-3.3-70b-instruct:free',
        prompt,
        'OpenRouter'
      ),
    },
  ];

  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const content = await provider.run();
      const result = parseInsight(content, provider.name);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.warn(`${provider.name} 診斷失敗，嘗試下一個備援模型:`, error);
    }
  }

  return res.status(200).json({ success: true, ...createRuleBasedInsight(input) });
}

export default withJsonError(handleAiInsights, '/api/ai-insights');
