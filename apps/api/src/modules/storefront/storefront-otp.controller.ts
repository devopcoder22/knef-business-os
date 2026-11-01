import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { StorefrontOtpService } from './storefront-otp.service';

function getOrgId(): string {
  const id = process.env['STOREFRONT_ORG_ID'];
  if (!id) throw new Error('STOREFRONT_ORG_ID environment variable not set');
  return id;
}

export class RequestEmailOtpDto {
  @IsEmail()
  email!: string;
}

export class VerifyEmailOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  code!: string;
}

export class RequestSmsOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;
}

export class VerifySmsOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  code!: string;
}

@ApiTags('storefront-otp')
@Public()
@Controller('storefront/otp')
export class StorefrontOtpController {
  constructor(private readonly otpService: StorefrontOtpService) {}

  @Post('email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request email OTP' })
  async requestEmailOtp(@Body() dto: RequestEmailOtpDto): Promise<{ message: string }> {
    await this.otpService.requestEmailOtp(getOrgId(), dto.email);
    return { message: 'Verification code sent to your email' };
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email OTP' })
  async verifyEmailOtp(@Body() dto: VerifyEmailOtpDto): Promise<{ verified: true }> {
    await this.otpService.verifyEmailOtp(dto.email, dto.code);
    return { verified: true };
  }

  @Post('sms')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request SMS OTP' })
  async requestSmsOtp(@Body() dto: RequestSmsOtpDto): Promise<{ message: string }> {
    await this.otpService.requestSmsOtp(getOrgId(), dto.phone);
    return { message: 'Verification code sent to your phone' };
  }

  @Post('sms/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify SMS OTP' })
  async verifySmsOtp(@Body() dto: VerifySmsOtpDto): Promise<{ verified: true }> {
    await this.otpService.verifySmsOtp(dto.phone, dto.code);
    return { verified: true };
  }
}
