import { IsEmail, IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class PostOrderRegisterDto {
  @IsString()
  @MaxLength(100)
  orderReference!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

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
}
