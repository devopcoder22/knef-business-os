import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import {
  QUEUES,
  JOB_TYPES,
  type IntegrationRefreshTokensJobData,
  type IntegrationHealthCheckJobData,
} from '@knef/constants';
import { IntegrationSyncService } from '../services/integration-sync.service';
import { ShopifyWorkerService } from '../services/shopify-worker.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class IntegrationSyncProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationSyncProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly integrationSync: IntegrationSyncService,
    private readonly shopifyWorker: ShopifyWorkerService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.worker = new Worker(
      QUEUES.INTEGRATIONS,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency: 5 },
    );

    this.worker.on('completed', (job) =>
      this.logger.debug(`Integration job ${job.id} (${job.name}) completed`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Integration job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log('Integration sync processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    // Delegate Shopify-specific jobs to the Shopify worker service
    if (job.name.startsWith('shopify-')) {
      await this.processShopifyJob(job);
      return;
    }

    switch (job.name) {
      case JOB_TYPES.INTEGRATION_REFRESH_TOKENS:
        await this.refreshTokens(job.data as IntegrationRefreshTokensJobData);
        break;
      case JOB_TYPES.INTEGRATION_HEALTH_CHECK:
        await this.healthCheck(job.data as IntegrationHealthCheckJobData);
        break;
      default:
        this.logger.warn(`Unknown integration job type: ${job.name}`);
    }
  }

  private async processShopifyJob(job: Job): Promise<void> {
    const { organizationId, connectionId } = job.data as { organizationId: string; connectionId: string };
    switch (job.name) {
      case JOB_TYPES.SHOPIFY_PRODUCT_SYNC: {
        const d = job.data as { productId: string; operation: 'publish' | 'update' | 'archive' };
        await this.shopifyWorker.syncProduct(organizationId, connectionId, d.productId, d.operation);
        break;
      }
      case JOB_TYPES.SHOPIFY_INVENTORY_SYNC: {
        const d = job.data as { productId?: string; variantId?: string };
        await this.shopifyWorker.syncInventory(organizationId, connectionId, d.productId, d.variantId);
        break;
      }
      case JOB_TYPES.SHOPIFY_ORDER_IMPORT: {
        const d = job.data as { shopifyOrderId: string };
        await this.shopifyWorker.importOrder(organizationId, connectionId, d.shopifyOrderId);
        break;
      }
      case JOB_TYPES.SHOPIFY_FULFILLMENT_SYNC: {
        const d = job.data as { salesOrderId: string; shopifyOrderId: string };
        await this.shopifyWorker.syncFulfillment(organizationId, connectionId, d.salesOrderId, d.shopifyOrderId);
        break;
      }
      case JOB_TYPES.SHOPIFY_RECONCILE: {
        const d = job.data as { scope: 'products' | 'inventory' | 'orders' | 'all' };
        await this.shopifyWorker.reconcile(organizationId, connectionId, d.scope);
        break;
      }
      case JOB_TYPES.SHOPIFY_WEBHOOK_PROCESS: {
        const d = job.data as { webhookEventId: string };
        await this.shopifyWorker.processWebhookEvent(d.webhookEventId);
        break;
      }
      case JOB_TYPES.SHOPIFY_HEALTH_CHECK: {
        await this.shopifyWorker.healthCheck(organizationId, connectionId);
        break;
      }
      default:
        this.logger.warn(`Unknown Shopify job type: ${job.name}`);
    }
  }

  private async refreshTokens(data: IntegrationRefreshTokensJobData): Promise<void> {
    this.logger.log(
      `Refreshing tokens for connection ${data.connectionId} (${data.provider}, org=${data.organizationId})`,
    );
    await this.integrationSync.refreshConnectionTokens(data.connectionId);
  }

  private async healthCheck(data: IntegrationHealthCheckJobData): Promise<void> {
    this.logger.log(
      `Health check for connection ${data.connectionId} (${data.provider}, org=${data.organizationId})`,
    );
    await this.integrationSync.runHealthCheck(data.connectionId);
  }
}
