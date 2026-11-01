import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
} from 'class-validator';

export class InviteUserDto {
  @ApiProperty({ example: 'john@knefgadgets.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Role IDs to assign', type: [String] })
  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];

  @ApiProperty({ required: false, description: 'Location IDs to restrict access to' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];
}
