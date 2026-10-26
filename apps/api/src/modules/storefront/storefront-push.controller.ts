import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WebPushService } from '../communications/web-push.service';
import { CustomerJwtGuard } from './guards/customer-jwt.guard';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import type { CustomerAccountContext } from './guards/customer-jwt.guard';

@ApiTags('storefront-push')
@ApiBearerAuth('CustomerJWT')
@UseGuards(CustomerJwtGuard)
@Controller('storefront/push')
export class StorefrontPushController {
  constructor(private readonly webPush: WebPushService) {}

  @Get('vapid-key')
  getVapidKey(@CurrentCustomer() account: CustomerAccountContext) {
    return this.webPush.getVapidPublicKey(account.organizationId);
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  subscribe(
    @CurrentCustomer() account: CustomerAccountContext,
    @Body() dto: { endpoint: string; p256dhKey: string; authKey: string; userAgent?: string },
  ) {
    return this.webPush.subscribe(account.id, account.organizationId, dto);
  }

  @Delete('unsubscribe')
  @HttpCode(HttpStatus.OK)
  unsubscribe(
    @CurrentCustomer() account: CustomerAccountContext,
    @Body() dto: { endpoint: string },
  ) {
    return this.webPush.unsubscribe(account.id, dto.endpoint);
  }

  @Get('subscriptions')
  listSubscriptions(@CurrentCustomer() account: CustomerAccountContext) {
    return this.webPush.listSubscriptions(account.id, account.organizationId);
  }
}
