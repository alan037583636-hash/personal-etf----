export async function readJsonResponse<T>(response: Response, invalidResponseMessage: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const statusMessage = response.ok
      ? invalidResponseMessage
      : `伺服器暫時無法處理請求（HTTP ${response.status}），請稍後再試。`;
    throw new Error(statusMessage);
  }
}
