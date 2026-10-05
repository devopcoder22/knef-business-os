import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('dashboard')
@ApiBearerAuth('JWT')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Operational dashboard stats' })
  getStats(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getStats(
      user.organizationId,
      user.locationIds ?? null,
    );
  }
}
