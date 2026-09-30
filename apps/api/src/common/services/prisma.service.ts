import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    // Log queries that take longer than 1 second
    this.$use(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const ms = Date.now() - start;
      if (ms > 1000) {
        this.logger.warn(
          `Slow query [${ms}ms]: ${params.model ?? 'unknown'}.${params.action}`,
        );
      }
      return result;
    });

    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
