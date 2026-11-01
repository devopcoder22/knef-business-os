import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MetaWhatsAppProvider } from './providers/meta-whatsapp.provider';
import { WhatsAppConfigService } from './whatsapp-config.service';

@Injectable()
export class WhatsAppTemplateService {
  private readonly logger = new Logger(WhatsAppTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly configService: WhatsAppConfigService,
    private readonly metaProvider: MetaWhatsAppProvider,
  ) {}

  async listTemplates(organizationId: string, status?: string) {
    return this.prisma.whatsAppTemplate.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        language: true,
        category: true,
        status: true,
        components: true,
        rejectionReason: true,
        lastSyncedAt: true,
        providerTemplateId: true,
        createdAt: true,
      },
    });
  }

  async syncTemplates(organizationId: string, userId: string): Promise<{ synced: number }> {
    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { organizationId } });
    if (!cfg) throw new NotFoundException('WhatsApp not configured');

    const accessToken = await this.configService.resolveAccessToken(organizationId);
    const remoteTemplates = await this.metaProvider.listTemplates(cfg.businessAccountId, accessToken);

    let synced = 0;
    for (const t of remoteTemplates) {
      await this.prisma.whatsAppTemplate.upsert({
        where: { organizationId_name_language: { organizationId, name: t.name, language: t.language } },
        create: {
          id: createId(),
          organizationId,
          whatsAppConfigId: cfg.id,
          providerTemplateId: t.id,
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          components: t.components as object ?? undefined,
          rejectionReason: t.rejectionReason ?? null,
          lastSyncedAt: new Date(),
        },
        update: {
          providerTemplateId: t.id,
          category: t.category,
          status: t.status,
          components: t.components as object ?? undefined,
          rejectionReason: t.rejectionReason ?? null,
          lastSyncedAt: new Date(),
        },
      });
      synced++;
    }

    await this.audit.log({ organizationId, userId, action: 'WHATSAPP_TEMPLATES_SYNCED', entity: 'WhatsAppTemplate', metadata: { synced } }).catch(() => {});
    return { synced };
  }

  async getApprovedTemplate(organizationId: string, name: string, language = 'en_US') {
    return this.prisma.whatsAppTemplate.findFirst({
      where: { organizationId, name, language, status: 'APPROVED' },
    });
  }
}
