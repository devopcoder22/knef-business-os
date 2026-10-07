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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';

@ApiTags('customers')
@ApiBearerAuth('JWT')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'List customers (paginated)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListCustomersDto) {
    return this.customersService.findAll(user.organizationId, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'Get customer detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.CUSTOMERS.CREATE)
  @ApiOperation({ summary: 'Create customer' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.CUSTOMERS.EDIT)
  @ApiOperation({ summary: 'Update customer' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.CUSTOMERS.DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate customer' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.softDelete(user.organizationId, id);
  }

  @Get(':id/sales-history')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'Get customer sales history' })
  getSalesHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.getSalesHistory(user.organizationId, id);
  }
}
