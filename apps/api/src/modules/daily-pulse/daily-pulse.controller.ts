import { Controller, Get, Put, Query, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DailyPulseService } from './daily-pulse.service';
import { DailyPulseConfigService, DailyPulseConfigDto } from './daily-pulse-config.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('daily-pulse')
@ApiBearerAuth('JWT')
@Controller('daily-pulse')
export class DailyPulseController {
  constructor(
    private readonly dailyPulseService: DailyPulseService,
    private readonly configService: DailyPulseConfigService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Get daily operational pulse snapshot' })
  getPulse(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ) {
    return this.dailyPulseService.getPulse(user.organizationId, date);
  }

  @Get('config')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Get daily pulse delivery config for this org' })
  getConfig(@CurrentUser() user: AuthUser) {
    return this.configService.getConfig(user.organizationId);
  }

  @Put('config')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Create or update daily pulse delivery config' })
  upsertConfig(@CurrentUser() user: AuthUser, @Body() dto: DailyPulseConfigDto) {
    return this.configService.upsertConfig(user.organizationId, dto);
  }

  @Get('deliveries')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'List daily pulse delivery history' })
  listDeliveries(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ) {
    return this.configService.listDeliveries(user.organizationId, date);
  }
}
