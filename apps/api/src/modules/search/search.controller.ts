import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GlobalSearchDto } from './dto/global-search.dto';
import { GlobalSearchResponseDto } from './dto/search-result.dto';
import type { AuthUser } from '@knef/types';

@ApiTags('search')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Global cross-entity search.
   *
   * Permissions are enforced per-entity inside the service — any entity the user cannot
   * view is silently excluded.  organizationId is sourced from the JWT user, never from
   * the query string.
   */
  @Get()
  @Throttle({ short: { ttl: 1_000, limit: 10 }, medium: { ttl: 60_000, limit: 100 } })
  @ApiOperation({ summary: 'Global search across all entities the user can view' })
  @ApiOkResponse({ type: GlobalSearchResponseDto })
  globalSearch(
    @CurrentUser() user: AuthUser,
    @Query() dto: GlobalSearchDto,
  ): Promise<GlobalSearchResponseDto> {
    return this.searchService.globalSearch(user, dto);
  }
}
