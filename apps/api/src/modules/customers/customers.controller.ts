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
import { CustomersService } from './customers.service';
import { PdfService } from '../../common/services/pdf.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { CreateTagDto } from './dto/create-tag.dto';

@ApiTags('customers')
@ApiBearerAuth('JWT')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly pdfService: PdfService,
    private readonly auditService: AuditService,
  ) {}

  // ── List / Search ─────────────────────────────────────────────────────────

  @Get()
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'List customers with search, filter, sort' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListCustomersDto) {
    return this.customersService.findAll(user.organizationId, query);
  }

  // ── Tags (org-level) ──────────────────────────────────────────────────────

  @Get('tags')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'List all customer tags for this organization' })
  listOrgTags(@CurrentUser() user: AuthUser) {
    return this.customersService.listOrgTags(user.organizationId);
  }

  @Post('tags')
  @Permissions(PERMISSIONS.CUSTOMERS.EDIT)
  @ApiOperation({ summary: 'Create a customer tag' })
  async createTag(@CurrentUser() user: AuthUser, @Body() dto: CreateTagDto) {
    const tag = await this.customersService.createTag(user.organizationId, dto);
    void this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CUSTOMER_TAG_CREATED',
      entity: 'CustomerTag',
      entityId: tag.id,
      newValues: { name: dto.name, color: dto.color },
    });
    return tag;
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  @Get(':id')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'Get customer detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.findOne(user.organizationId, id);
  }

  // ── Create / Update / Delete ──────────────────────────────────────────────

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

  // ── Metrics ───────────────────────────────────────────────────────────────

  @Get(':id/metrics')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'Get deterministic customer metrics and segments' })
  getMetrics(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.getMetrics(user.organizationId, id);
  }

  // ── Timeline ──────────────────────────────────────────────────────────────

  @Get(':id/timeline')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'Get customer activity timeline' })
  getTimeline(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.customersService.getTimeline(
      user.organizationId,
      id,
      limit ? parseInt(limit) : 50,
      user.locationIds ?? null,
    );
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  @Get(':id/notes')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'List customer notes' })
  listNotes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.listNotes(user.organizationId, id);
  }

  @Post(':id/notes')
  @Permissions(PERMISSIONS.CUSTOMERS.EDIT)
  @ApiOperation({ summary: 'Add customer note' })
  addNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
  ) {
    void this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CUSTOMER_NOTE_ADDED',
      entity: 'Customer',
      entityId: id,
    });
    return this.customersService.addNote(user.organizationId, id, dto, user.id);
  }

  @Delete(':id/notes/:noteId')
  @Permissions(PERMISSIONS.CUSTOMERS.EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete customer note (author only)' })
  async deleteNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ) {
    const result = await this.customersService.deleteNote(user.organizationId, id, noteId, user.id);
    void this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CUSTOMER_NOTE_DELETED',
      entity: 'Customer',
      entityId: id,
      newValues: { noteId },
    });
    return result;
  }

  // ── Tags (per-customer) ───────────────────────────────────────────────────

  @Post(':id/tags/:tagId')
  @Permissions(PERMISSIONS.CUSTOMERS.EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign tag to customer' })
  async assignTag(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ) {
    const result = await this.customersService.assignTag(user.organizationId, id, tagId);
    void this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CUSTOMER_TAG_ASSIGNED',
      entity: 'Customer',
      entityId: id,
      newValues: { tagId },
    });
    return result;
  }

  @Delete(':id/tags/:tagId')
  @Permissions(PERMISSIONS.CUSTOMERS.EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove tag from customer' })
  async removeTag(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ) {
    const result = await this.customersService.removeTag(user.organizationId, id, tagId);
    void this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CUSTOMER_TAG_REMOVED',
      entity: 'Customer',
      entityId: id,
      newValues: { tagId },
    });
    return result;
  }

  // ── History / Related records ─────────────────────────────────────────────

  @Get(':id/sales-history')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'Get customer sales orders' })
  getSalesHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.getSalesHistory(user.organizationId, id, user.locationIds ?? null);
  }

  @Get(':id/invoices')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'Get customer invoices' })
  getInvoices(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.getInvoices(user.organizationId, id);
  }

  @Get(':id/receipts')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'Get customer receipts' })
  getReceipts(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.getReceipts(user.organizationId, id);
  }

  @Get(':id/statement')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'Get customer account statement' })
  getStatement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.customersService.getStatement(user.organizationId, id, startDate, endDate);
  }

  @Get(':id/statement/pdf')
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  @ApiOperation({ summary: 'Download customer statement as PDF' })
  async getStatementPdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ) {
    const statement = await this.customersService.getStatement(
      user.organizationId, id, startDate, endDate,
    );
    void this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'STATEMENT_PDF_DOWNLOADED',
      entity: 'Customer',
      entityId: id,
    });
    const pdfBuffer = await this.pdfService.generateStatementPdf(
      statement.data as never,
      user.organizationId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="statement-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
