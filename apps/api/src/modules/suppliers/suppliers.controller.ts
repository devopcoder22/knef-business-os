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
import { SuppliersService } from './suppliers.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { CreateSupplierContactDto } from './dto/create-supplier-contact.dto';
import { CreateSupplierPriceDto } from './dto/create-supplier-price.dto';

@ApiTags('suppliers')
@ApiBearerAuth('JWT')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Permissions(PERMISSIONS.SUPPLIERS.VIEW)
  @ApiOperation({ summary: 'List suppliers (paginated)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListSuppliersDto) {
    return this.suppliersService.findAll(user.organizationId, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SUPPLIERS.VIEW)
  @ApiOperation({ summary: 'Get supplier detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.suppliersService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.SUPPLIERS.CREATE)
  @ApiOperation({ summary: 'Create supplier' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.SUPPLIERS.EDIT)
  @ApiOperation({ summary: 'Update supplier' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.SUPPLIERS.DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate supplier' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.suppliersService.softDelete(user.organizationId, id);
  }

  // ── Contacts ──────────────────────────────────────────────────

  @Post(':id/contacts')
  @Permissions(PERMISSIONS.SUPPLIERS.EDIT)
  @ApiOperation({ summary: 'Add supplier contact' })
  addContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateSupplierContactDto,
  ) {
    return this.suppliersService.addContact(user.organizationId, id, dto);
  }

  @Delete(':id/contacts/:contactId')
  @Permissions(PERMISSIONS.SUPPLIERS.EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove supplier contact' })
  removeContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.suppliersService.removeContact(user.organizationId, id, contactId);
  }

  // ── Prices ────────────────────────────────────────────────────

  @Get(':id/prices')
  @Permissions(PERMISSIONS.SUPPLIERS.VIEW)
  @ApiOperation({ summary: 'Get supplier prices' })
  getPrices(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.suppliersService.getPrices(user.organizationId, id);
  }

  @Post(':id/prices')
  @Permissions(PERMISSIONS.SUPPLIERS.EDIT)
  @ApiOperation({ summary: 'Add/update supplier price for a product' })
  addPrice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateSupplierPriceDto,
  ) {
    return this.suppliersService.addPrice(user.organizationId, id, dto);
  }

  @Get(':id/purchase-history')
  @Permissions(PERMISSIONS.SUPPLIERS.VIEW)
  @ApiOperation({ summary: 'Get supplier purchase history' })
  getPurchaseHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.suppliersService.getPurchaseHistory(user.organizationId, id);
  }
}
