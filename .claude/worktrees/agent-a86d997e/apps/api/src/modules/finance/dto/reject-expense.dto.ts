import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectExpenseDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
