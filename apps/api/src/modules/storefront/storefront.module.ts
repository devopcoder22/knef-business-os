import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorefrontAuthController } from './storefront.controller';
import { StorefrontOrdersController } from './storefront-orders.controller';
import { StorefrontAuthService } from './storefront-auth.service';
import { StorefrontOtpService } from './storefront-otp.service';
import { StorefrontOtpController } from './storefront-otp.controller';
import { StorefrontNotificationListener } from './storefront-notification.listener';
import { CustomerJwtGuard } from './guards/customer-jwt.guard';
import { CommonModule } from '../../common/services/common.module';
import { CommunicationsModule } from '../communications/communications.module';

@Module({
  imports: [
    CommonModule,
    CommunicationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [StorefrontAuthController, StorefrontOrdersController, StorefrontOtpController],
  providers: [
    StorefrontAuthService,
    StorefrontOtpService,
    StorefrontNotificationListener,
    CustomerJwtGuard,
  ],
})
export class StorefrontModule {}
