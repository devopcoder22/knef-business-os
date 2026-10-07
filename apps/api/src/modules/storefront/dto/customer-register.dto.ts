import { IsEmail, IsString, MinLength, IsOptional, MaxLength } from 'class-validator';

export class CustomerRegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
