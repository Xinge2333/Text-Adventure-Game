import Fastify, { FastifyInstance } from 'fastify';
import { loadConfig, type AppConfig } from './config';
import { configureTelemetry } from './telemetry/metrics';
import { clearCatalogCache, getCatalogIndex, scheduleCatalogRefresh, stopCatalogRefresh } from './services/themeIndex';
import { storiesRoutes } from './routes/stories';
import { catalogRoutes } from './routes/catalog';
import { telemetryRoutes } from './routes/telemetry';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { recommendationRoutes } from './routes/recommendations';

export const buildServer = (appConfig: AppConfig = loadConfig()): FastifyInstance => {
  configureTelemetry(appConfig);
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info'
    }
  });

  app.log.info(
    {
      llmProvider: appConfig.llm.provider,
      llmMock: appConfig.llm.mock,
      llmTimeoutMs: appConfig.llm.timeoutMs,
      llmMaxRetries: appConfig.llm.maxRetries
    },
    'llm-configuration'
  );

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/__catalog-demo', async () => {
    const index = await getCatalogIndex();
    return index;
  });
  app.delete('/__catalog-demo', async () => {
    clearCatalogCache();
    return { cleared: true };
  });

  app.register(authRoutes);
  app.register(userRoutes);
  app.register(recommendationRoutes);
  app.register(storiesRoutes);
  app.register(catalogRoutes);
  app.register(telemetryRoutes);

  const refreshEnabled = process.env.CATALOG_REFRESH_DISABLED !== 'true';
  if (refreshEnabled) {
    scheduleCatalogRefresh();
    app.addHook('onClose', async () => {
      stopCatalogRefresh();
    });
  }

  return app;
};

const start = async () => {
  const appConfig = loadConfig();
  const { port, host } = appConfig;
  const app = buildServer(appConfig);

  try {
    await app.listen({ port, host });
    app.log.info(`Server listening on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  void start();
}
