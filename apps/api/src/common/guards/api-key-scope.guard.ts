import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_SCOPE_KEY } from '../decorators/require-api-scope.decorator';
import { AuditService } from '../../modules/audit/audit.service';
import type { Request } from 'express';

interface ApiKeyRecord {
  id: string;
  organizationId: string;
  name: string;
  scopes: string[];
}

@Injectable()
export class ApiKeyScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(API_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No scope metadata → not a scope-gated route (backward compat for internal routes)
    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { apiKey?: ApiKeyRecord }>();
    const apiKey = request.apiKey;

    if (!apiKey) {
      // ApiKeyGuard must run before ApiKeyScopeGuard; if no context, deny
      throw new ForbiddenException('No API key context available');
    }

    const grantedScopes = apiKey.scopes;
    const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s));

    if (missingScopes.length > 0) {
      const endpoint = `${context.getClass().name}.${context.getHandler().name}`;

      await this.audit.log({
        organizationId: apiKey.organizationId,
        action: 'API_KEY_SCOPE_DENIED',
        entity: 'ApiKey',
        entityId: apiKey.id,
        metadata: {
          keyName: apiKey.name,
          endpoint,
          requiredScopes,
          grantedScopes,
          missingScopes,
        },
      });

      throw new ForbiddenException(
        `Insufficient API key scopes. Required: ${requiredScopes.join(', ')}`,
      );
    }

    return true;
  }
}
