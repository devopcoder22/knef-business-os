import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Routes accessible when mustChangePassword is true
const ALLOWED_WHILE_MCP = [
  'POST /api/v1/auth/change-password',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/refresh',
];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser extends { mustChangePassword?: boolean }>(
    err: Error | null,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Authentication required');
    }
    if (user.mustChangePassword) {
      const req = context.switchToHttp().getRequest<Request>();
      const key = `${req.method} ${req.path}`;
      if (!ALLOWED_WHILE_MCP.includes(key)) {
        throw new ForbiddenException('Password change required before accessing this resource');
      }
    }
    return user;
  }
}
