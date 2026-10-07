import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { PrismaService } from '../services/prisma.service';
import type { AuthUser } from '@knef/types';
import { Request } from 'express';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const flag = await this.prisma.featureFlag.findUnique({
      where: {
        organizationId_key: {
          organizationId: user.organizationId,
          key: requiredFeature,
        },
      },
    });

    if (!flag?.isEnabled) {
      throw new ForbiddenException(
        `Feature '${requiredFeature}' is not enabled for your organization`,
      );
    }

    return true;
  }
}
