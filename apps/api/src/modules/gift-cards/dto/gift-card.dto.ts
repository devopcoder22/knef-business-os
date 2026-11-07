import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsPositive,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGiftCardDto {
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsEmail()
  issuedToEmail?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ValidateGiftCardDto {
  @IsString()
  code!: string;
}

export class RedeemGiftCardDto {
  @IsString()
  code!: string;

  @IsNumber()
  @IsPositive()
  @Min(0.01)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsString()
  orderId?: string;
}
