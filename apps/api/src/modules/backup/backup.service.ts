import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { createId } from '@paralleldrive/cuid2';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as cron from 'node-cron';

const BACKUP_DIR = process.env['BACKUP_DIR'] ?? '/app/backups';

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private cronTask: cron.ScheduledTask | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.applySchedule();
  }

  async getConfig() {
    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: { in: ['backup.enabled', 'backup.schedule', 'backup.retentionDays'] },
      },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      enabled: map['backup.enabled'] === 'true',
      schedule: map['backup.schedule'] ?? '0 2 * * *',
      retentionDays: parseInt(map['backup.retentionDays'] ?? '30', 10),
    };
  }

  async setConfig(
    organizationId: string,
    config: { enabled?: boolean; schedule?: string; retentionDays?: number },
  ) {
    const upserts: Promise<unknown>[] = [];

    if (config.enabled !== undefined) {
      upserts.push(
        this.prisma.systemSetting.upsert({
          where: { organizationId_key: { organizationId, key: 'backup.enabled' } },
          update: { value: String(config.enabled) },
          create: {
            id: createId(),
            organizationId,
            key: 'backup.enabled',
            value: String(config.enabled),
          },
        }),
      );
    }

    if (config.schedule !== undefined) {
      upserts.push(
        this.prisma.systemSetting.upsert({
          where: { organizationId_key: { organizationId, key: 'backup.schedule' } },
          update: { value: config.schedule },
          create: {
            id: createId(),
            organizationId,
            key: 'backup.schedule',
            value: config.schedule,
          },
        }),
      );
    }

    if (config.retentionDays !== undefined) {
      upserts.push(
        this.prisma.systemSetting.upsert({
          where: { organizationId_key: { organizationId, key: 'backup.retentionDays' } },
          update: { value: String(config.retentionDays) },
          create: {
            id: createId(),
            organizationId,
            key: 'backup.retentionDays',
            value: String(config.retentionDays),
          },
        }),
      );
    }

    await Promise.all(upserts);
    await this.applySchedule();
    return this.getConfig();
  }

  async listBackups(limit = 20) {
    return this.prisma.systemBackup.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  async triggerBackup(triggeredBy?: string) {
    const databaseUrl = this.config.get<string>('DATABASE_URL');
    if (!databaseUrl) throw new Error('DATABASE_URL not configured');

    await fs.mkdir(BACKUP_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-${timestamp}.dump`;
    const filepath = path.join(BACKUP_DIR, filename);

    const record = await this.prisma.systemBackup.create({
      data: {
        id: createId(),
        filename,
        status: 'RUNNING',
        triggeredBy: triggeredBy ?? 'manual',
        startedAt: new Date(),
      },
    });

    try {
      await this.runPgDump(databaseUrl, filepath);
      const stat = await fs.stat(filepath).catch(() => null);
      await this.prisma.systemBackup.update({
        where: { id: record.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          sizeBytes: stat ? BigInt(stat.size) : null,
        },
      });
      this.logger.log(`Backup completed: ${filename} (${stat?.size ?? 0} bytes)`);
      await this.pruneOldBackups();
      return { success: true, filename, sizeBytes: stat?.size ?? 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.systemBackup.update({
        where: { id: record.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: msg },
      });
      this.logger.error(`Backup failed: ${msg}`);
      throw new Error(`Backup failed: ${msg}`);
    }
  }

  private runPgDump(databaseUrl: string, filepath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('pg_dump', [databaseUrl, '-F', 'c', '-f', filepath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pg_dump exited with code ${code}: ${stderr.slice(0, 500)}`));
      });

      proc.on('error', (err) =>
        reject(
          new Error(
            `pg_dump not found: ${err.message}. Install postgresql-client in Docker.`,
          ),
        ),
      );
    });
  }

  private async pruneOldBackups() {
    const cfg = await this.getConfig();
    const cutoff = new Date(Date.now() - cfg.retentionDays * 86_400_000);
    const old = await this.prisma.systemBackup.findMany({
      where: { createdAt: { lt: cutoff }, status: 'COMPLETED' },
    });
    for (const b of old) {
      const fp = path.join(BACKUP_DIR, b.filename);
      await fs.unlink(fp).catch(() => {});
      await this.prisma.systemBackup.delete({ where: { id: b.id } });
    }
  }

  private async applySchedule() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }
    const cfg = await this.getConfig().catch(() => ({
      enabled: false,
      schedule: '0 2 * * *',
      retentionDays: 30,
    }));
    if (!cfg.enabled) return;
    if (!cron.validate(cfg.schedule)) {
      this.logger.warn(`Invalid backup cron schedule: ${cfg.schedule}`);
      return;
    }
    this.cronTask = cron.schedule(cfg.schedule, () => {
      this.triggerBackup('scheduler').catch((err) =>
        this.logger.error('Scheduled backup failed', err),
      );
    });
    this.logger.log(`Backup scheduled: ${cfg.schedule}`);
  }
}
