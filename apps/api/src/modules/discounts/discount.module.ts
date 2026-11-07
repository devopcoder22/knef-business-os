import { Module } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { DiscountController, PublicDiscountController } from './discount.controller';

@Module({
  providers: [DiscountService],
  controllers: [DiscountController, PublicDiscountController],
  exports: [DiscountService],
})
export class DiscountModule {}
