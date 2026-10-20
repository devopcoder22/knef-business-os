import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import { SocialAccountService } from './social-account.service';
import { PublicationService } from './publication.service';
import { IsString, IsOptional } from 'class-validator';

class SyncAccountsDto {
  @IsString() connectionId!: string;
}

class PublishNowDto {
  @IsString() draftId!: string;
  @IsString() socialAccountId!: string;
  @IsOptional() @IsString() variantId?: string;
}

@Controller('social')
export class SocialPublishingController {
  constructor(
    private readonly accounts: SocialAccountService,
    private readonly publication: PublicationService,
  ) {}

  // ── Social Accounts ──────────────────────────────────────────────────────────

  @Permissions(PERMISSIONS.INTEGRATIONS.VIEW)
  @Get('accounts')
  listAccounts(@Req() req: { user: { organizationId: string } }) {
    return this.accounts.listAccounts(req.user.organizationId);
  }

  @Permissions(PERMISSIONS.INTEGRATIONS.VIEW)
  @Get('accounts/:provider')
  listByProvider(
    @Req() req: { user: { organizationId: string } },
    @Param('provider') provider: string,
  ) {
    return this.accounts.listAccounts(req.user.organizationId, provider.toUpperCase());
  }

  @Permissions(PERMISSIONS.INTEGRATIONS.MANAGE)
  @Post('accounts/sync')
  @HttpCode(HttpStatus.OK)
  syncAccounts(
    @Req() req: { user: { organizationId: string; sub: string } },
    @Body() dto: SyncAccountsDto,
  ) {
    return this.accounts.syncAccountsFromConnection(
      req.user.organizationId,
      dto.connectionId,
      req.user.sub,
    );
  }

  @Permissions(PERMISSIONS.INTEGRATIONS.MANAGE)
  @Delete('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivateAccount(
    @Req() req: { user: { organizationId: string; sub: string } },
    @Param('id') id: string,
  ) {
    return this.accounts.deactivate(req.user.organizationId, id, req.user.sub);
  }

  // ── Publishing ───────────────────────────────────────────────────────────────

  @Permissions(PERMISSIONS.MARKETING.PUBLISH)
  @Post('publish')
  @HttpCode(HttpStatus.ACCEPTED)
  publishNow(
    @Req() req: { user: { organizationId: string; sub: string } },
    @Body() dto: PublishNowDto,
  ) {
    return this.publication.publishNow(
      req.user.organizationId,
      req.user.sub,
      dto.draftId,
      dto.socialAccountId,
      dto.variantId,
    );
  }

  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @Get('drafts/:draftId/attempts')
  listAttempts(
    @Req() req: { user: { organizationId: string } },
    @Param('draftId') draftId: string,
  ) {
    return this.publication.listAttempts(req.user.organizationId, draftId);
  }

  @Permissions(PERMISSIONS.MARKETING.PUBLISH)
  @Post('attempts/:id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  retry(
    @Req() req: { user: { organizationId: string; sub: string } },
    @Param('id') id: string,
  ) {
    return this.publication.retryAttempt(req.user.organizationId, id, req.user.sub);
  }
}
