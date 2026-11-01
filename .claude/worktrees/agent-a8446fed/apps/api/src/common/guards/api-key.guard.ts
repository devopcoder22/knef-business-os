import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { createHash } from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string>;
    const key = headers['x-api-key'];
    if (!key) throw new UnauthorizedException('API key required');
    const keyHash = createHash('sha256').update(key).digest('hex');
    const apiKey = await this.prisma.aPIKey.findFirst({
      where: { keyHash, isActive: true },
    });
    if (!apiKey) throw new UnauthorizedException('Invalid API key');
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) throw new UnauthorizedException('API key expired');
    // Update lastUsedAt non-blocking
    this.prisma.aPIKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    request['apiKey'] = apiKey;
    request['organizationId'] = apiKey.organizationId;
    return true;
  }
}
