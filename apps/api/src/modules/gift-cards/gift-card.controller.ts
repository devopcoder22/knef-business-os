import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GiftCardService } from './gift-card.service';
import { CreateGiftCardDto, ValidateGiftCardDto, RedeemGiftCardDto } from './dto/gift-card.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

// ─── Admin / authenticated controller ────────────────────────────────────────

@ApiTags('gift-cards')
@ApiBearerAuth('JWT')
@Controller('gift-cards')
export class GiftCardController {
  constructor(private readonly giftCards: GiftCardService) {}

  @Get()
  @Permissions(PERMISSIONS.SALES.MANAGE)
  @ApiOperation({ summary: 'List gift cards for the organization' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.giftCards.list(user.organizationId, page, limit);
  }

  @Post()
  @Permissions(PERMISSIONS.SALES.MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Issue a new gift card' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGiftCardDto) {
    return this.giftCards.create(user.organizationId, user.id, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SALES.MANAGE)
  @ApiOperation({ summary: 'Get a gift card by ID with redemption history' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.giftCards.findById(user.organizationId, id);
  }

  @Patch(':id/deactivate')
  @Permissions(PERMISSIONS.SALES.MANAGE)
  @ApiOperation({ summary: 'Deactivate a gift card' })
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.giftCards.deactivate(user.organizationId, user.id, id);
  }

  @Post('redeem')
  @Permissions(PERMISSIONS.SALES.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem a gift card (internal/POS use)' })
  redeem(@CurrentUser() user: AuthUser, @Body() dto: RedeemGiftCardDto) {
    return this.giftCards.redeem(user.organizationId, dto);
  }
}

// ─── Public controller ───────────────────────────────────────────────────────

@ApiTags('gift-cards-public')
@Public()
@Controller('public/gift-cards')
export class PublicGiftCardController {
  constructor(private readonly giftCards: GiftCardService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a gift card code (public storefront use)' })
  async validate(@Body() dto: ValidateGiftCardDto) {
    // Org is derived from the STOREFRONT_ORG_ID env var for public calls
    const orgId = process.env['STOREFRONT_ORG_ID'];
    if (!orgId) {
      throw new Error('STOREFRONT_ORG_ID environment variable not set');
    }
    const result = await this.giftCards.validate(orgId, dto.code);
    return {
      remainingAmount: result.remainingAmount,
      expiresAt: result.giftCard.expiresAt,
    };
  }
}
