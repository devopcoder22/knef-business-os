import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import workerConfig, { validateWorkerConfig } from './config/worker.config';

// Services
import { PrismaService } from './services/prisma.service';
import { EmailSenderService } from './services/email-sender.service';
import { CalendarSyncService } from './services/calendar-sync.service';
import { IntegrationSyncService } from './services/integration-sync.service';
import { SmsSenderService } from './services/sms-sender.service';
import { EmbeddingService } from './services/embedding.service';
import { ReportDataService } from './services/report-data.service';
import { ReportExportersService } from './services/report-exporters.service';
import { SocialPublisherService } from './services/social-publisher.service';

// Processors
import { EmailProcessor } from './processors/email.processor';
import { NotificationsProcessor } from './processors/notifications.processor';
import { AIAgentProcessor } from './processors/ai-agent.processor';
import { ReportsProcessor } from './processors/reports.processor';
import { DocumentsProcessor } from './processors/documents.processor';
import { BackupProcessor } from './processors/backup.processor';
import { CalendarProcessor } from './processors/calendar.processor';
import { AutomationProcessor } from './processors/automation.processor';
import { IntegrationSyncProcessor } from './processors/integration-sync.processor';
import { MarketingSchedulerProcessor } from './processors/marketing-scheduler.processor';
import { SocialPublishingProcessor } from './processors/social-publishing.processor';
import { AdvertisingSyncProcessor } from './processors/advertising-sync.processor';

// Schedulers
import { CampaignScheduler } from './schedulers/campaign.scheduler';
import { AIAgentScheduler } from './schedulers/ai-agent.scheduler';
import { CalendarSyncScheduler } from './schedulers/calendar-sync.scheduler';
import { BackupScheduler } from './schedulers/backup.scheduler';
import { AdvertisingScheduler } from './schedulers/advertising-scheduler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [workerConfig],
      validate: (config) => validateWorkerConfig(config),
      cache: true,
    }),
  ],
  providers: [
    // Infrastructure
    PrismaService,
    EmailSenderService,
    CalendarSyncService,
    IntegrationSyncService,
    SmsSenderService,
    EmbeddingService,
    ReportDataService,
    ReportExportersService,
    SocialPublisherService,

    // Processors
    EmailProcessor,
    NotificationsProcessor,
    AIAgentProcessor,
    ReportsProcessor,
    DocumentsProcessor,
    BackupProcessor,
    CalendarProcessor,
    AutomationProcessor,
    IntegrationSyncProcessor,
    MarketingSchedulerProcessor,
    SocialPublishingProcessor,
    AdvertisingSyncProcessor,

    // Schedulers
    CampaignScheduler,
    AIAgentScheduler,
    CalendarSyncScheduler,
    BackupScheduler,
    AdvertisingScheduler,
  ],
})
export class WorkerModule {}
