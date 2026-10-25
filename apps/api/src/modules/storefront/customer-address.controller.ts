import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerJwtGuard } from './guards/customer-jwt.guard';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import { CustomerAddressService, CreateSavedAddressDto } from './customer-address.service';
import type { CustomerAccountContext } from './guards/customer-jwt.guard';

@ApiTags('storefront-addresses')
@UseGuards(CustomerJwtGuard)
@ApiBearerAuth('customer-JWT')
@Controller('storefront/addresses')
export class CustomerAddressController {
  constructor(private readonly addressService: CustomerAddressService) {}

  @Get()
  @ApiOperation({ summary: 'List saved addresses' })
  list(@CurrentCustomer() customer: CustomerAccountContext) {
    return this.addressService.listAddresses(customer.id, customer.organizationId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a saved address' })
  create(
    @CurrentCustomer() customer: CustomerAccountContext,
    @Body() dto: CreateSavedAddressDto,
  ) {
    return this.addressService.createAddress(customer.id, customer.organizationId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a saved address' })
  update(
    @CurrentCustomer() customer: CustomerAccountContext,
    @Param('id') id: string,
    @Body() dto: Partial<CreateSavedAddressDto>,
  ) {
    return this.addressService.updateAddress(customer.id, customer.organizationId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a saved address' })
  async remove(
    @CurrentCustomer() customer: CustomerAccountContext,
    @Param('id') id: string,
  ) {
    await this.addressService.deleteAddress(customer.id, customer.organizationId, id);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Set an address as default' })
  setDefault(
    @CurrentCustomer() customer: CustomerAccountContext,
    @Param('id') id: string,
  ) {
    return this.addressService.setDefault(customer.id, customer.organizationId, id);
  }
}
