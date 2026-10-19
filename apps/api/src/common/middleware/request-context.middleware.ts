import { Request, Response, NextFunction } from 'express';
import { requestContextStore } from '../services/request-context.service';

export function RequestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ipAddress =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.ip ??
    req.socket?.remoteAddress;

  const ctx = {
    ipAddress,
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'] as string | undefined,
  };

  requestContextStore.run(ctx, next);
}
