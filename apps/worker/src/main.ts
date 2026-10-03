import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

const logger = new Logger('WorkerBootstrap');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.enableShutdownHooks();

  logger.log('KNEF Background Worker started');

  const shutdown = async (signal: string) => {
    logger.log(`${signal} received — shutting down gracefully`);
    await app.close();
    logger.log('Worker shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err: unknown) => {
  logger.error('Worker failed to start', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
