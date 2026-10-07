import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SearchEntityType } from '../search-entity.registry';

export class SearchResultDto {
  @ApiProperty()
  type!: SearchEntityType;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  subtitle!: string;

  @ApiProperty()
  route!: string;

  @ApiPropertyOptional()
  metadata?: Record<string, string>;
}

export class GlobalSearchResponseDto {
  @ApiProperty()
  query!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: [SearchResultDto] })
  results!: SearchResultDto[];

  @ApiProperty({
    description: 'Results grouped by entity type (only groups the user has permission for are included)',
  })
  byType!: Partial<Record<SearchEntityType, SearchResultDto[]>>;
}
