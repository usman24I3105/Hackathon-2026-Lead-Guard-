/**
 * LeadGuard Backend — main entry point
 * Boot order: config → pools → sweeper → outbox → http
 */
import './config'; // Validates env and exits on failure

import { config } from './config';
import { buildApp } from './http/app';
import { startSweeper } from './domain/escalation';
import { closePools } from './db/pool';
import logger from './http/logger';

async function main(): Promise<void> {
  logger.info({ env: config.NODE_ENV, port: config.PORT }, '🚀 Starting LeadGuard backend');

  // Start escalation sweeper (runs inside this process)
  const sweeperInterval = startSweeper();
  logger.info('✅ Escalation sweeper started');

  // Build and start HTTP server
  const app = buildApp();
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, `✅ HTTP server listening on :${config.PORT}`);
    logger.info(`   Health: http://localhost:${config.PORT}/api/health`);
    logger.info(`   Stream: http://localhost:${config.PORT}/api/stream`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down...');
    clearInterval(sweeperInterval);
    server.close(async () => {
      await closePools();
      logger.info('Goodbye 👋');
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
