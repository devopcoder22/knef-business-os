import { Module } from '@nestjs/common';
import { PrintTemplatesService } from './print-templates.service';
import { PrintTemplatesController } from './print-templates.controller';

@Module({
  providers: [PrintTemplatesService],
  controllers: [PrintTemplatesController],
  exports: [PrintTemplatesService],
})
export class PrintTemplatesModule {}
