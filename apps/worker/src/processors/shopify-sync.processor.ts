import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import {
  QUEUES,
  JOB_TYPES,
  type ShopifyProductSyncJobData,
  type ShopifyInventorySyncJobData,
  type ShopifyOrderImportJobData,
  type ShopifyFulfillmentSyncJobData,
  type ShopifyReconcileJobData,
  type ShopifyWebhookProcessJobData,
  type IntegrationHealthCheckJobData,
} from '@knef/constants';
import { ShopifyWorkerService } from '../services/shopify-worker.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class ShopifySyncProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShopifySyncProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly shopify: ShopifyWorkerService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.worker = new Worker(
      QUEUES.INTEGRATIONS,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency: 3 },
    );

    this.worker.on('completed', job =>
      this.logger.debug(`Shopify job ${job.id} (${job.name}) completed`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Shopify job ${job?.id} (${job?.name}) failed: ${err.message}`),
    );

    this.logger.log('Shopify sync processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_TYPES.SHOPIFY_PRODUCT_SYNC: {
        const data = job.data as ShopifyProductSyncJobData;
        await this.shopify.syncProduct(data.organizationId, data.connectionId, data.productId, data.operation);
        break;
      }
      case JOB_TYPES.SHOPIFY_INVENTORY_SYNC: {
        const data = job.data as ShopifyInventorySyncJobData;
        await this.shopify.syncInventory(data.organizationId, data.connectionId, data.productId, data.variantId);
        break;
      }
      case JOB_TYPES.SHOPIFY_ORDER_IMPORT: {
        const data = job.data as ShopifyOrderImportJobData;
        await this.shopify.importOrder(data.organizationId, data.connectionId, data.shopifyOrderId);
        break;
      }
      case JOB_TYPES.SHOPIFY_FULFILLMENT_SYNC: {
        const data = job.data as ShopifyFulfillmentSyncJobData;
        await this.shopify.syncFulfillment(data.organizationId, data.connectionId, data.salesOrderId, data.shopifyOrderId);
        break;
      }
      case JOB_TYPES.SHOPIFY_RECONCILE: {
        const data = job.data as ShopifyReconcileJobData;
        await this.shopify.reconcile(data.organizationId, data.connectionId, data.scope);
        break;
      }
      case JOB_TYPES.SHOPIFY_WEBHOOK_PROCESS: {
        const data = job.data as ShopifyWebhookProcessJobData;
        await this.shopify.processWebhookEvent(data.webhookEventId);
        break;
      }
      case JOB_TYPES.SHOPIFY_HEALTH_CHECK: {
        const data = job.data as IntegrationHealthCheckJobData;
        await this.shopify.healthCheck(data.organizationId, data.connectionId);
        break;
      }
      default:
        // Not a Shopify job — ignore (integration-sync.processor handles the rest)
        break;
    }
  }
}
