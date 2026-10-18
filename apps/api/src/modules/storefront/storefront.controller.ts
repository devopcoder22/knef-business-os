import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { StorefrontAuthService } from './storefront-auth.service';
import { CustomerJwtGuard } from './guards/customer-jwt.guard';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import { CustomerRegisterDto } from './dto/customer-register.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { CustomerRefreshDto } from './dto/customer-refresh.dto';
import { PostOrderRegisterDto } from './dto/post-order-register.dto';
import type { CustomerAccountContext } from './guards/customer-jwt.guard';

// Derive orgId from a fixed env var or from request host
// For Stage 23: use STOREFRONT_ORG_ID env var (set in Docker)
function getOrgId(): string {
  const id = process.env['STOREFRONT_ORG_ID'];
  if (!id) throw new Error('STOREFRONT_ORG_ID environment variable not set');
  return id;
}

@ApiTags('storefront-auth')
@Public()
@Controller('storefront/auth')
export class StorefrontAuthController {
  constructor(private readonly authService: StorefrontAuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Customer registration' })
  register(@Body() dto: CustomerRegisterDto) {
    return this.authService.register(getOrgId(), dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer login' })
  login(@Body() dto: CustomerLoginDto) {
    return this.authService.login(getOrgId(), dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh customer token' })
  refresh(@Body() dto: CustomerRefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Get('profile')
  @UseGuards(CustomerJwtGuard)
  @ApiBearerAuth('customer-JWT')
  @ApiOperation({ summary: 'Get customer profile' })
  profile(@CurrentCustomer() customer: CustomerAccountContext) {
    return this.authService.getProfile(customer.id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CustomerJwtGuard)
  @ApiBearerAuth('customer-JWT')
  @ApiOperation({ summary: 'Customer logout' })
  logout(
    @CurrentCustomer() customer: CustomerAccountContext,
    @Body() dto: CustomerRefreshDto,
  ) {
    return this.authService.logout(customer.id, dto.refreshToken);
  }

  @Post('post-order-register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register an account after placing a guest order' })
  postOrderRegister(@Body() dto: PostOrderRegisterDto) {
    return this.authService.postOrderRegister(getOrgId(), dto);
  }
}
