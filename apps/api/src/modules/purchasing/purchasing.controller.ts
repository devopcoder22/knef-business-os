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
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { PurchasingService } from './purchasing.service';
import { PdfService } from '../../common/services/pdf.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { RecordSupplierPaymentDto } from './dto/record-supplier-payment.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';

// ── Purchase Orders ───────────────────────────────────────────

@ApiTags('purchase-orders')
@ApiBearerAuth('JWT')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly purchasingService: PurchasingService,
    private readonly pdfService: PdfService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  @ApiOperation({ summary: 'List purchase orders' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListPurchaseOrdersDto) {
    return this.purchasingService.listPurchaseOrders(user.organizationId, query, user.locationIds);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  @ApiOperation({ summary: 'Get purchase order detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasingService.findPurchaseOrder(user.organizationId, id, user.locationIds);
  }

  @Post()
  @Permissions(PERMISSIONS.PURCHASING.CREATE)
  @ApiOperation({ summary: 'Create purchase order (DRAFT)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchasingService.createPurchaseOrder(user.organizationId, dto, user.id, user.locationIds);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PURCHASING.CREATE)
  @ApiOperation({ summary: 'Update purchase order (DRAFT only)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreatePurchaseOrderDto>,
  ) {
    return this.purchasingService.updatePurchaseOrder(user.organizationId, id, dto);
  }

  @Post(':id/submit')
  @Permissions(PERMISSIONS.PURCHASING.CREATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit purchase order for approval' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasingService.submitPurchaseOrder(user.organizationId, id);
  }

  @Post(':id/approve')
  @Permissions(PERMISSIONS.PURCHASING.APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve purchase order' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasingService.approvePurchaseOrder(user.organizationId, id, user.id, user.locationIds);
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.PURCHASING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel purchase order' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.purchasingService.cancelPurchaseOrder(user.organizationId, id, body.reason, user.id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.PURCHASING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete purchase order (DRAFT only)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasingService.deletePurchaseOrder(user.organizationId, id);
  }

  @Get(':id/pdf')
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  @ApiOperation({ summary: 'Download purchase order as PDF' })
  async generatePdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const po = await this.purchasingService.findPurchaseOrder(user.organizationId, id, user.locationIds);
    const pdfBuffer = await this.pdfService.generatePoPdf(po as never, user.organizationId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="po-${po.reference}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}

// ── Goods Receipts ─────────────────────────────────────────────

@ApiTags('goods-receipts')
@ApiBearerAuth('JWT')
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(
    private readonly purchasingService: PurchasingService,
    private readonly pdfService: PdfService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  @ApiOperation({ summary: 'List goods receipts' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.purchasingService.listGoodsReceipts(
      user.organizationId,
      parseInt(page ?? '1'),
      parseInt(limit ?? '20'),
      user.locationIds,
    );
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  @ApiOperation({ summary: 'Get goods receipt detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasingService.findGoodsReceipt(user.organizationId, id, user.locationIds);
  }

  @Post()
  @Permissions(PERMISSIONS.PURCHASING.RECEIVE)
  @ApiOperation({ summary: 'Create goods receipt' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGoodsReceiptDto) {
    return this.purchasingService.createGoodsReceipt(user.organizationId, dto, user.id);
  }

  @Get(':id/pdf')
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  @ApiOperation({ summary: 'Download goods received note as PDF' })
  async generatePdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const grn = await this.purchasingService.findGoodsReceipt(user.organizationId, id, user.locationIds);
    const pdfBuffer = await this.pdfService.generateGrnPdf(grn as never, user.organizationId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="grn-${grn.reference}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}

// ── Supplier Invoices ──────────────────────────────────────────

@ApiTags('supplier-invoices')
@ApiBearerAuth('JWT')
@Controller('supplier-invoices')
export class SupplierInvoicesController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Get()
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  @ApiOperation({ summary: 'List supplier invoices' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.purchasingService.listSupplierInvoices(
      user.organizationId,
      parseInt(page ?? '1'),
      parseInt(limit ?? '20'),
    );
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  @ApiOperation({ summary: 'Get supplier invoice detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasingService.findSupplierInvoice(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.PURCHASING.CREATE)
  @ApiOperation({ summary: 'Create supplier invoice' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierInvoiceDto) {
    return this.purchasingService.createSupplierInvoice(user.organizationId, dto);
  }

  @Post(':id/record-payment')
  @Permissions(PERMISSIONS.PURCHASING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record payment for supplier invoice' })
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordSupplierPaymentDto,
  ) {
    return this.purchasingService.recordSupplierPayment(user.organizationId, id, dto);
  }
}

// ── Purchase Returns ───────────────────────────────────────────

@ApiTags('purchase-returns')
@ApiBearerAuth('JWT')
@Controller('purchase-returns')
export class PurchaseReturnsController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Get()
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  @ApiOperation({ summary: 'List purchase returns' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.purchasingService.listPurchaseReturns(
      user.organizationId,
      parseInt(page ?? '1'),
      parseInt(limit ?? '20'),
    );
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  @ApiOperation({ summary: 'Get purchase return detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasingService.findPurchaseReturn(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.PURCHASING.CREATE)
  @ApiOperation({ summary: 'Create purchase return' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseReturnDto) {
    return this.purchasingService.createPurchaseReturn(user.organizationId, dto, user.id);
  }

  @Post(':id/approve')
  @Permissions(PERMISSIONS.PURCHASING.APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve purchase return' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasingService.approvePurchaseReturn(user.organizationId, id);
  }

  @Post(':id/complete')
  @Permissions(PERMISSIONS.PURCHASING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete purchase return (deducts stock)' })
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasingService.completePurchaseReturn(user.organizationId, id, user.id);
  }
}
