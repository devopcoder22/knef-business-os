import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ExternalConnectionsService } from './external-connections.service';

@ApiExcludeController()
@Controller('integrations/oauth')
export class IntegrationsOAuthController {
  constructor(private readonly connections: ExternalConnectionsService) {}

  @Get('callback')
  @Public()
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string,
    @Res() res: Response,
  ) {
    const base = process.env['NEXT_PUBLIC_WEB_URL'] ?? 'http://localhost:3000';

    if (oauthError || !code || !state) {
      const reason = encodeURIComponent(oauthError ?? 'missing_params');
      return res.redirect(`${base}/integrations?error=${reason}`);
    }

    try {
      const result = await this.connections.handleOAuthCallback(code, state);
      return res.redirect(
        `${base}/integrations/connections?connected=${result.provider}&id=${result.connectionId}`,
      );
    } catch {
      return res.redirect(`${base}/integrations?error=callback_failed`);
    }
  }
}
