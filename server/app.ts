import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { apiRateLimit } from './middleware/rateLimit';
import { flightsRouter } from './routes/flights';
import { searchRouter } from './routes/search';

dotenv.config();

export function createApp() {
  const app = express();
  const allowedOrigins = [
    'http://localhost:5173',
    process.env.VITE_API_BASE_URL,
    process.env.CLIENT_ORIGIN,
  ].filter((value): value is string => Boolean(value));

  app.use(
    cors({
      origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin not allowed by CORS.'));
      },
    }),
  );
  app.use(express.json());
  app.use('/api', apiRateLimit);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/flights', flightsRouter);
  app.use('/api/search', searchRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    res.status(500).json({ error: message });
  });

  return app;
}
