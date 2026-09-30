import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';
import { createHash } from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string>;
    const key = headers['x-api-key'];

    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      throw new UnauthorizedException('API key required');
    }

    const keyHash = createHash('sha256').update(key).digest('hex');

    // Find by hash without isActive filter so we can distinguish revoked from invalid
    const apiKey = await this.prisma.aPIKey.findFirst({ where: { keyHash } });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (!apiKey.isActive) {
      this.audit
        .log({
          organizationId: apiKey.organizationId,
          action: 'API_KEY_AUTH_DENIED',
          entity: 'ApiKey',
          entityId: apiKey.id,
          metadata: { keyName: apiKey.name, reason: 'revoked' },
        })
        .catch(() => {});
      throw new UnauthorizedException('API key has been revoked');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      this.audit
        .log({
          organizationId: apiKey.organizationId,
          action: 'API_KEY_AUTH_DENIED',
          entity: 'ApiKey',
          entityId: apiKey.id,
          metadata: {
            keyName: apiKey.name,
            reason: 'expired',
            expiresAt: apiKey.expiresAt,
          },
        })
        .catch(() => {});
      throw new UnauthorizedException('API key expired');
    }

    // Update lastUsedAt non-blocking
    this.prisma.aPIKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    request['apiKey'] = apiKey;
    request['organizationId'] = apiKey.organizationId;
    return true;
  }
}
