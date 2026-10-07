import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@knef/types';
import { Request } from 'express';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
    return request.user;
  },
);
