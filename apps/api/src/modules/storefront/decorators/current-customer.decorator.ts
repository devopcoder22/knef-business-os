import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CustomerAccountContext } from '../guards/customer-jwt.guard';

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerAccountContext => {
    const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    return request['customerAccount'] as CustomerAccountContext;
  },
);
