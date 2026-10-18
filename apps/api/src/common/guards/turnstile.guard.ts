import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class TurnstileGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.configService.get<string>('CLOUDFLARE_TURNSTILE_SECRET');
    if (!secret) return true; // Skip when not configured (local dev)

    const request = context.switchToHttp().getRequest<Request>();
    const token: string | undefined = (request.body as Record<string, unknown>)?.turnstileToken as string | undefined;

    if (!token) {
      throw new ForbiddenException('CAPTCHA verification required');
    }

    const params = new URLSearchParams({ secret, response: token });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await res.json() as { success: boolean };
    if (!data.success) {
      throw new ForbiddenException('CAPTCHA verification failed. Please try again.');
    }

    return true;
  }
}
