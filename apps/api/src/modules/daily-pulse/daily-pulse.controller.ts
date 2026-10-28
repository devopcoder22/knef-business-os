import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DailyPulseService } from './daily-pulse.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('daily-pulse')
@ApiBearerAuth('JWT')
@Controller('daily-pulse')
export class DailyPulseController {
  constructor(private readonly dailyPulseService: DailyPulseService) {}

  @Get()
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Get daily operational pulse snapshot' })
  getPulse(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ) {
    return this.dailyPulseService.getPulse(user.organizationId, date);
  }
}
