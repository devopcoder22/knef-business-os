import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { SalesService } from './sales.service';
import { PdfService } from '../../common/services/pdf.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ListSalesOrdersDto } from './dto/list-sales-orders.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RefundOrderDto } from './dto/refund-order.dto';

// ── Sales Orders ──────────────────────────────────────────────

@ApiTags('sales-orders')
@ApiBearerAuth('JWT')
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @Permissions(PERMISSIONS.SALES.VIEW)
  @ApiOperation({ summary: 'List sales orders' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListSalesOrdersDto) {
    return this.salesService.listSalesOrders(user.organizationId, query, user.locationIds);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SALES.VIEW)
  @ApiOperation({ summary: 'Get sales order detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.findSalesOrder(user.organizationId, id, user.locationIds);
  }

  @Post()
  @Permissions(PERMISSIONS.SALES.CREATE)
  @ApiOperation({ summary: 'Create sales order (DRAFT)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSalesOrderDto) {
    return this.salesService.createSalesOrder(user.organizationId, dto, user.id, user.locationIds);
  }

  @Post(':id/confirm')
  @Permissions(PERMISSIONS.SALES.CREATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm sales order' })
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.confirmSalesOrder(user.organizationId, id);
  }

  @Post(':id/complete')
  @Permissions(PERMISSIONS.SALES.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete sales order (deducts stock)' })
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.completeSalesOrder(user.organizationId, id, user.id);
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.SALES.CANCEL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel sales order' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.salesService.cancelSalesOrder(user.organizationId, id, body.reason);
  }

  @Post(':id/refund')
  @Permissions(PERMISSIONS.SALES.REFUND)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund sales order' })
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RefundOrderDto,
  ) {
    return this.salesService.refundSalesOrder(user.organizationId, id, dto, user.id);
  }
}

// ── Invoices ──────────────────────────────────────────────────

@ApiTags('invoices')
@ApiBearerAuth('JWT')
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly pdfService: PdfService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.SALES.VIEW)
  @ApiOperation({ summary: 'List invoices' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.salesService.listInvoices(
      user.organizationId,
      parseInt(page ?? '1'),
      parseInt(limit ?? '20'),
    );
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SALES.VIEW)
  @ApiOperation({ summary: 'Get invoice detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.findInvoice(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.SALES.CREATE)
  @ApiOperation({ summary: 'Create invoice from order' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.salesService.createInvoice(user.organizationId, dto);
  }

  @Post(':id/record-payment')
  @Permissions(PERMISSIONS.SALES.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record payment for invoice' })
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.salesService.recordPayment(user.organizationId, id, dto);
  }

  @Get(':id/pdf')
  @Permissions(PERMISSIONS.SALES.VIEW)
  @ApiOperation({ summary: 'Generate invoice PDF' })
  async generatePdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const invoice = await this.salesService.findInvoice(user.organizationId, id);
    const pdfBuffer = await this.pdfService.generateInvoicePdf(invoice as never, user.organizationId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${invoice.reference}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}

// ── Receipts ──────────────────────────────────────────────────

@ApiTags('receipts')
@ApiBearerAuth('JWT')
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly salesService: SalesService,
    private readonly pdfService: PdfService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.SALES.VIEW)
  @ApiOperation({ summary: 'List sales receipts' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.salesService.listReceipts(
      user.organizationId,
      parseInt(page ?? '1'),
      parseInt(limit ?? '20'),
    );
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SALES.VIEW)
  @ApiOperation({ summary: 'Get receipt detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.findReceipt(user.organizationId, id);
  }

  @Get(':id/pdf')
  @Permissions(PERMISSIONS.SALES.VIEW)
  @ApiOperation({ summary: 'Download receipt as A4 PDF' })
  async generatePdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const receipt = await this.salesService.findReceipt(user.organizationId, id);
    void this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'RECEIPT_PDF_DOWNLOADED',
      entity: 'Receipt',
      entityId: id,
    });
    const pdfBuffer = await this.pdfService.generateReceiptPdf(receipt as never, user.organizationId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${receipt.reference}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Get(':id/thermal')
  @Permissions(PERMISSIONS.SALES.VIEW)
  @ApiOperation({ summary: 'Get thermal receipt HTML for printing' })
  async getThermal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const receipt = await this.salesService.findReceipt(user.organizationId, id);
    void this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'RECEIPT_THERMAL_PRINTED',
      entity: 'Receipt',
      entityId: id,
    });
    const html = await this.pdfService.generateThermalReceiptHtml(receipt as never, user.organizationId);
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }
}
