import { Module } from '@nestjs/common';
import { GiftCardService } from './gift-card.service';
import { GiftCardController, PublicGiftCardController } from './gift-card.controller';

@Module({
  controllers: [GiftCardController, PublicGiftCardController],
  providers: [GiftCardService],
  exports: [GiftCardService],
})
export class GiftCardsModule {}
