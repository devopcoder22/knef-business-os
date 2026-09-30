import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class ListEcommerceOrdersDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
