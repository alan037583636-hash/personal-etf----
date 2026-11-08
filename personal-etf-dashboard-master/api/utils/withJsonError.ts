import type { VercelRequest, VercelResponse } from '@vercel/node';

type ApiHandler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;

export function withJsonError(handler: ApiHandler, endpoint: string): ApiHandler {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      console.error(`API ${endpoint} 未處理錯誤:`, error);
      if (res.headersSent) return;
      return res.status(500).json({
        success: false,
        error: '伺服器暫時無法處理請求，請稍後再試。',
      });
    }
  };
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label}逾時`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
