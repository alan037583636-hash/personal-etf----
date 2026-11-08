import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import historicalPricesHandler from './api/historical-prices.ts';
import stockSearchHandler from './api/stock-search.ts';
import marketInsightsHandler from './api/market-insights.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API 路由: 轉發至與 Vercel Serverless Function 相同之處理函數
  app.all('/api/historical-prices', (req, res) => {
    return historicalPricesHandler(req as any, res as any);
  });
  app.all('/api/stock-search', (req, res) => {
    return stockSearchHandler(req as any, res as any);
  });
  app.all('/api/market-insights', (req, res) => {
    return marketInsightsHandler(req as any, res as any);
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
