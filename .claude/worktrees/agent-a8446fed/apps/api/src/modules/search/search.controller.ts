import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('search')
@ApiBearerAuth('JWT')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'Global search across products, serialized units' })
  globalSearch(
    @CurrentUser() user: AuthUser,
    @Query('q') q: string,
    @Query('types') types?: string,
  ) {
    const typeList = types ? types.split(',').map((t) => t.trim()) : undefined;
    return this.searchService.globalSearch(user.organizationId, q, typeList);
  }
}
