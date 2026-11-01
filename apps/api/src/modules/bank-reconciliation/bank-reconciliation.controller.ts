import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { BankReconciliationService, ImportRow } from './bank-reconciliation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('bank-reconciliation')
@ApiBearerAuth('JWT')
@Controller('bank-reconciliation')
export class BankReconciliationController {
  constructor(private readonly reconService: BankReconciliationService) {}

  @Get(':bankAccountId/summary')
  @Permissions(PERMISSIONS.FINANCE.RECONCILE)
  @ApiOperation({ summary: 'Get reconciliation summary for a bank account' })
  getSummary(@CurrentUser() user: AuthUser, @Param('bankAccountId') bankAccountId: string) {
    return this.reconService.getReconciliationSummary(user.organizationId, bankAccountId);
  }

  @Post(':bankAccountId/imports/upload')
  @Permissions(PERMISSIONS.FINANCE.RECONCILE)
  @ApiOperation({ summary: 'Upload XLSX/XLS/CSV bank statement file and import' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req: any, file: any, cb: any) => {
        const allowed = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'application/csv',
          'application/octet-stream',
        ];
        const name: string = file.originalname ?? '';
        const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
        if (!allowed.includes(file.mimetype) && !['.xlsx', '.xls', '.csv'].includes(ext)) {
          return cb(new BadRequestException('Only .xlsx, .xls, or .csv files are accepted'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadStatement(
    @CurrentUser() user: AuthUser,
    @Param('bankAccountId') bankAccountId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const rows: ImportRow[] = this.reconService.parseXlsxBuffer(
      file.buffer as Buffer,
      file.originalname as string,
    );
    return this.reconService.importStatement(
      user.organizationId,
      bankAccountId,
      file.originalname as string,
      'XLSX',
      rows,
      user.id,
    );
  }

  @Get(':bankAccountId/imports')
  @Permissions(PERMISSIONS.FINANCE.RECONCILE)
  @ApiOperation({ summary: 'List statement imports for a bank account' })
  listImports(
    @CurrentUser() user: AuthUser,
    @Param('bankAccountId') bankAccountId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.reconService.listImports(user.organizationId, bankAccountId, { page, limit });
  }

  @Post(':bankAccountId/imports')
  @Permissions(PERMISSIONS.FINANCE.RECONCILE)
  @ApiOperation({ summary: 'Import bank statement rows (CSV/XLSX pre-parsed)' })
  importStatement(
    @CurrentUser() user: AuthUser,
    @Param('bankAccountId') bankAccountId: string,
    @Body() body: { fileName: string; fileType: string; rows: ImportRow[] },
  ) {
    return this.reconService.importStatement(
      user.organizationId,
      bankAccountId,
      body.fileName,
      body.fileType,
      body.rows,
      user.id,
    );
  }

  @Get('imports/:importId/transactions')
  @Permissions(PERMISSIONS.FINANCE.RECONCILE)
  @ApiOperation({ summary: 'List transactions from a specific import' })
  listImportTransactions(
    @CurrentUser() user: AuthUser,
    @Param('importId') importId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('matchStatus') matchStatus?: string,
  ) {
    return this.reconService.listImportTransactions(user.organizationId, importId, {
      page,
      limit,
      matchStatus,
    });
  }

  @Patch('import-transactions/:importTxnId/match')
  @Permissions(PERMISSIONS.FINANCE.RECONCILE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually match import transaction to a bank transaction' })
  matchTransaction(
    @CurrentUser() user: AuthUser,
    @Param('importTxnId') importTxnId: string,
    @Body() body: { bankTxnId: string },
  ) {
    return this.reconService.matchTransaction(user.organizationId, importTxnId, body.bankTxnId, user.id);
  }

  @Patch('import-transactions/:importTxnId/confirm')
  @Permissions(PERMISSIONS.FINANCE.RECONCILE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a matched import transaction as reconciled' })
  confirmMatch(
    @CurrentUser() user: AuthUser,
    @Param('importTxnId') importTxnId: string,
  ) {
    return this.reconService.confirmMatch(user.organizationId, importTxnId, user.id);
  }

  @Patch('import-transactions/:importTxnId/exclude')
  @Permissions(PERMISSIONS.FINANCE.RECONCILE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exclude import transaction from reconciliation' })
  excludeTransaction(
    @CurrentUser() user: AuthUser,
    @Param('importTxnId') importTxnId: string,
  ) {
    return this.reconService.excludeTransaction(user.organizationId, importTxnId);
  }
}
