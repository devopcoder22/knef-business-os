import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import workerConfig, { validateWorkerConfig } from './config/worker.config';

// Services
import { PrismaService } from './services/prisma.service';
import { EmailSenderService } from './services/email-sender.service';
import { CalendarSyncService } from './services/calendar-sync.service';
import { EmbeddingService } from './services/embedding.service';
import { ReportDataService } from './services/report-data.service';
import { ReportExportersService } from './services/report-exporters.service';

// Processors
import { EmailProcessor } from './processors/email.processor';
import { NotificationsProcessor } from './processors/notifications.processor';
import { AIAgentProcessor } from './processors/ai-agent.processor';
import { ReportsProcessor } from './processors/reports.processor';
import { DocumentsProcessor } from './processors/documents.processor';
import { BackupProcessor } from './processors/backup.processor';
import { CalendarProcessor } from './processors/calendar.processor';
import { AutomationProcessor } from './processors/automation.processor';

// Schedulers
import { CampaignScheduler } from './schedulers/campaign.scheduler';
import { AIAgentScheduler } from './schedulers/ai-agent.scheduler';
import { CalendarSyncScheduler } from './schedulers/calendar-sync.scheduler';
import { BackupScheduler } from './schedulers/backup.scheduler';

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
    EmbeddingService,
    ReportDataService,
    ReportExportersService,

    // Processors
    EmailProcessor,
    NotificationsProcessor,
    AIAgentProcessor,
    ReportsProcessor,
    DocumentsProcessor,
    BackupProcessor,
    CalendarProcessor,
    AutomationProcessor,

    // Schedulers
    CampaignScheduler,
    AIAgentScheduler,
    CalendarSyncScheduler,
    BackupScheduler,
  ],
})
export class WorkerModule {}
