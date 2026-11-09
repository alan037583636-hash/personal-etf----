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
  riskMetrics: { annualizedVolatility: number | null; sharpeRatio: number | null; beta: number | null };
}

interface InsightResponse {
  summary: string;
  pros: string[];
  cons: string[];
  provider: InsightProvider;
}

const SYSTEM_PROMPT = `你是一位擁有十年經驗的專業台股量化分析師與基金經理人。我會提供一組投資組合的歷史回測數據（包含成分股、權重、產業分佈、年化報酬率 CAGR、最大回撤 MDD 等）。
請根據數據給出精準的診斷，嚴格遵守以下原則：

- 拒絕廢話：不要單純重複數字，要給出背後的見解（例如：不要只說「半導體佔25%」，要說「產業集中於半導體達25%，若遇科技股資金輪動，抗跌能力將面臨考驗」）。
- 優勢 (Pros)：點出獲利動能強弱、或是產業佈局的分散程度是否具備防禦力。
- 風險 (Cons)：必須將 MDD 具象化（例如「歷史最大回撤高達 -35.91%，意味著若投入 100 萬，在最差情境下曾縮水至約 64 萬」），並點出高波動或單一事件影響的風險。
- 總結 (Summary)：給出一句精準的總結與具體行動建議（例如是否需要季再平衡，或是加入防禦型類股）。
- 僅依據提供的資料推論，不得捏造數據或市場事件；明確指出歷史績效不代表未來表現。
你必須且只能回傳一個乾淨的 JSON 格式，絕對不要包含任何 Markdown 標記（如 \`\`\`json），結構如下：
{
"pros": ["優勢洞察1", "優勢洞察2", "優勢洞察3"],
"cons": ["風險洞察1", "風險洞察2", "風險洞察3"],
"summary": "一句核心的 AI 總結與行動建議"
}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return finiteNumber(value) ?? undefined;
}

function safeText(value: unknown, maxLength = 100): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function parseInput(value: Record<string, unknown>): InsightInput | null {
  if (!Array.isArray(value.holdings) || !Array.isArray(value.sectors) ||
      !Array.isArray(value.recentPerformance) || !isRecord(value.metrics) || !isRecord(value.market) ||
      !isRecord(value.riskMetrics)) {
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
  const annualizedVolatility = nullableFiniteNumber(value.riskMetrics.annualizedVolatility);
  const sharpeRatio = nullableFiniteNumber(value.riskMetrics.sharpeRatio);
  const beta = nullableFiniteNumber(value.riskMetrics.beta);
  const changePercent = value.market.changePercent === null
    ? null
    : finiteNumber(value.market.changePercent);
  if (currentNav === null || cagr === null || maxDrawdown === null || allTimeReturn === null ||
      annualizedVolatility === undefined || sharpeRatio === undefined || beta === undefined ||
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
    riskMetrics: { annualizedVolatility, sharpeRatio, beta },
  };
}

function parseInsight(text: string, provider: InsightProvider): InsightResponse {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!isRecord(parsed) || typeof parsed.summary !== 'string' ||
      !Array.isArray(parsed.pros) || !Array.isArray(parsed.cons)) {
    throw new Error(`${provider} 回傳格式不符合預期`);
  }
  const pros = parsed.pros.filter((item): item is string => typeof item === 'string').slice(0, 6);
  const cons = parsed.cons.filter((item): item is string => typeof item === 'string').slice(0, 6);
  if (!parsed.summary.trim() || pros.length === 0 || cons.length === 0) {
    throw new Error(`${provider} 回傳內容不完整`);
  }
  return { summary: parsed.summary.trim(), pros, cons, provider };
}

function createRuleBasedInsight(input: InsightInput): InsightResponse {
  const topSector = input.sectors[0];
  const bestPerformer = input.recentPerformance.reduce<(typeof input.recentPerformance)[number] | null>(
    (best, item) => !best || item.returnPercent > best.returnPercent ? item : best,
    null
  );
  const summaryParts = [
    `目前組合淨值 ${input.metrics.currentNav.toFixed(2)} 元，查詢區間 CAGR 約 ${input.metrics.cagr.toFixed(2)}%。`,
  ];
  if (topSector) summaryParts.push(`權重最高的產業為${topSector.sector}（${topSector.percent.toFixed(1)}%）。`);

  const pros = [
    bestPerformer
      ? `${bestPerformer.name}近期觀察區間報酬 ${bestPerformer.returnPercent >= 0 ? '+' : ''}${bestPerformer.returnPercent.toFixed(1)}%，為目前可取得資料中表現較佳的成分股。`
      : '目前成分股資料已提供配置基礎，建議持續追蹤各標的及產業變化。',
  ];
  if (input.metrics.cagr > 0) pros.push(`查詢區間 CAGR 為正（${input.metrics.cagr.toFixed(2)}%），但不代表未來報酬。`);
  if (input.market.changePercent !== null) {
    pros.push(`台灣加權指數近約 3 個月變動 ${input.market.changePercent >= 0 ? '+' : ''}${input.market.changePercent.toFixed(2)}%。`);
  }

  const remainingValue = Math.max(0, 1 - input.metrics.maxDrawdown / 100);
  const cons = [
    `查詢區間最大回撤約 -${input.metrics.maxDrawdown.toFixed(2)}%；以 100 萬元投入換算，歷史最差期間資產曾降至約 ${(remainingValue * 100).toFixed(1)} 萬元，實際未來跌幅可能不同。`,
  ];
  if (topSector && topSector.percent >= 35) {
    cons.push(`${topSector.sector}權重約 ${topSector.percent.toFixed(1)}%，產業集中可能放大相關供應鏈風險。`);
  }
  if (input.recentPerformance.some((item) => item.annualizedVolatility >= 45)) {
    cons.push('部分成分股近期年化波動度偏高，請留意短期價格起伏。');
  }
  if (input.riskMetrics.annualizedVolatility !== null) {
    cons.push(`組合年化波動度約 ${(input.riskMetrics.annualizedVolatility * 100).toFixed(2)}%，市場劇烈震盪時淨值可能快速變動。`);
  }
  while (cons.length < 3) {
    cons.push('歷史回測僅反映特定期間與資料條件，無法涵蓋所有市場情境，宜定期檢視風險承受度。');
  }
  while (pros.length < 3) {
    pros.push('可依既定頻率檢視各成分股權重，讓配置偏離目標時能及時調整。');
  }
  return {
    summary: `${summaryParts.join('')} 建議依投資目標定期檢視並再平衡；歷史表現不代表未來結果。`,
    pros: pros.slice(0, 3),
    cons: cons.slice(0, 3),
    provider: '內建規則',
  };
}

function createPrompt(input: InsightInput): string {
  return `投資組合歷史回測資料：\n${JSON.stringify(input)}`;
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
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
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
        { role: 'system', content: SYSTEM_PROMPT },
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
