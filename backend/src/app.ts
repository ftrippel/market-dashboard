import { Hono } from 'hono';
import type { BackendDependencies, BackendEnv } from './env';
import { failure } from './http';
import { apiCors } from './middleware/cors';
import { requestId } from './middleware/requestId';
import { registerChartRoutes } from './routes/charts';
import { registerHealthRoutes } from './routes/health';
import { registerInstrumentRoutes } from './routes/instruments';
import { registerQuoteRoutes } from './routes/quotes';
import { lookupYahooInstruments, lookupYahooQuotes } from './services/yahooFinance';

export function createApp(
  dependencies: BackendDependencies = {
    lookupInstruments: lookupYahooInstruments,
    lookupQuotes: lookupYahooQuotes,
  },
): Hono<BackendEnv> {
  const app = new Hono<BackendEnv>();

  app.use('/api/*', requestId);
  app.use('/api/*', apiCors);

  registerHealthRoutes(app);
  registerChartRoutes(app, dependencies);
  registerInstrumentRoutes(app, dependencies);
  registerQuoteRoutes(app, dependencies);

  app.notFound((c) => failure(c, 404, 'NOT_FOUND', 'The requested API route was not found.'));
  app.onError((error, c) => {
    console.error('Unhandled API error:', error);
    return failure(c, 502, 'UPSTREAM_ERROR', 'The upstream market-data request failed.');
  });

  return app;
}
