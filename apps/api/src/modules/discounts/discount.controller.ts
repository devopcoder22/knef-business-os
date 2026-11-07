import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  ParseBoolPipe,
  ParseIntPipe,
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DiscountService } from './discount.service';
import { CreateDiscountCodeDto, UpdateDiscountCodeDto, ValidateDiscountDto } from './dto/discount.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('Discounts')
@ApiBearerAuth()
@Controller('discounts')
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Get()
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('isActive') isActive?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters: { isActive?: boolean; limit?: number; offset?: number } = {};
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (limit !== undefined) filters.limit = parseInt(limit, 10);
    if (offset !== undefined) filters.offset = parseInt(offset, 10);
    return this.discountService.list(user.organizationId, filters);
  }

  @Post()
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateDiscountCodeDto) {
    return this.discountService.create(user.organizationId, user.id, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.discountService.findById(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDiscountCodeDto,
  ) {
    return this.discountService.update(user.organizationId, user.id, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  async deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.discountService.delete(user.organizationId, user.id, id);
  }
}

@ApiTags('Public Discounts')
@Controller('public/discounts')
export class PublicDiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Post('validate')
  @Public()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.OK)
  async validate(
    @Body() dto: ValidateDiscountDto,
    @Query('orgId') orgId: string,
  ) {
    const result = await this.discountService.validate(
      orgId,
      dto.code,
      dto.orderAmount,
      dto.customerEmail,
    );
    const dc = result.discountCode as { code: string; type: string; value: number };
    return {
      valid: result.valid,
      discountAmount: result.discountAmount,
      code: dc.code,
      type: dc.type,
      value: dc.value,
    };
  }
}
