import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { PdfService } from '../../common/services/pdf.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [CustomersService, PdfService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
