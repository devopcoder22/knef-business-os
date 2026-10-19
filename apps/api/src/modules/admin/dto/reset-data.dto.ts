import { IsArray, IsIn } from 'class-validator';

export const RESET_CATEGORIES = ['products', 'inventory', 'purchasing', 'orders', 'finance', 'customers', 'staff'] as const;
export type ResetCategory = typeof RESET_CATEGORIES[number];

export class ResetDataDto {
  @IsArray()
  @IsIn(RESET_CATEGORIES, { each: true })
  categories!: ResetCategory[];
}
