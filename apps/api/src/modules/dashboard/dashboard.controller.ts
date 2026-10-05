import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '@knef/types';

@ApiTags('dashboard')
@ApiBearerAuth('JWT')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Operational dashboard stats' })
  getStats(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getStats(
      user.organizationId,
      user.locationIds ?? null,
    );
  }
}
