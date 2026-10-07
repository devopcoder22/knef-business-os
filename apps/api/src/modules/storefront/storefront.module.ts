import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorefrontAuthController } from './storefront.controller';
import { StorefrontOrdersController } from './storefront-orders.controller';
import { StorefrontAuthService } from './storefront-auth.service';
import { CustomerJwtGuard } from './guards/customer-jwt.guard';
import { CommonModule } from '../../common/services/common.module';

@Module({
  imports: [
    CommonModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [StorefrontAuthController, StorefrontOrdersController],
  providers: [StorefrontAuthService, CustomerJwtGuard],
})
export class StorefrontModule {}
