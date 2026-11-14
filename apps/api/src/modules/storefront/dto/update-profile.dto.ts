import { IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** What a signed-in customer may change about themselves. Email and phone are not editable here. */
export class UpdateCustomerProfileDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'First name is required' })
  @MaxLength(100)
  @Matches(/^[^<>]*$/, { message: 'First name contains invalid characters' })
  firstName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Last name is required' })
  @MaxLength(100)
  @Matches(/^[^<>]*$/, { message: 'Last name contains invalid characters' })
  lastName!: string;
}
