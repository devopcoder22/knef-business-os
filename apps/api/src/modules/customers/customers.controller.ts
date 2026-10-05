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

@ApiTags('customers')
@ApiBearerAuth('JWT')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly pdfService: PdfService,
    private readonly auditService: AuditService,
  ) {}

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
    const statement = await this.customersService.getStatement(user.organizationId, id, startDate, endDate);
    void this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'STATEMENT_PDF_DOWNLOADED',
      entity: 'Customer',
      entityId: id,
    });
    const pdfBuffer = await this.pdfService.generateStatementPdf(statement.data as never, user.organizationId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="statement-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
