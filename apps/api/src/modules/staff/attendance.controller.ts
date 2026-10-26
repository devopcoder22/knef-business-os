import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { ListOrgAttendanceDto } from './dto/list-org-attendance.dto';
import { ListAttendanceDto } from './dto/list-attendance.dto';

@ApiTags('attendance')
@ApiBearerAuth('JWT')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ── Employee self-service ─────────────────────────────────────
  // IMPORTANT: /me/* routes must come BEFORE /:id to avoid "me" being treated as an ID

  @Post('clock-in')
  @Permissions(PERMISSIONS.STAFF.CLOCK)
  @ApiOperation({ summary: 'Clock in (server time, idempotent)' })
  clockIn(@CurrentUser() user: AuthUser, @Body() dto: ClockInDto) {
    return this.attendanceService.clockIn(user.id, user.organizationId, dto);
  }

  @Post('clock-out')
  @Permissions(PERMISSIONS.STAFF.CLOCK)
  @ApiOperation({ summary: 'Clock out for today' })
  clockOut(@CurrentUser() user: AuthUser, @Body() dto: ClockOutDto) {
    return this.attendanceService.clockOut(user.id, user.organizationId, dto);
  }

  @Get('me/status')
  @Permissions(PERMISSIONS.STAFF.CLOCK)
  @ApiOperation({ summary: 'Get my current clock status for today' })
  getMyStatus(@CurrentUser() user: AuthUser) {
    return this.attendanceService.getMyStatus(user.id, user.organizationId);
  }

  @Get('me/history')
  @Permissions(PERMISSIONS.STAFF.CLOCK)
  @ApiOperation({ summary: 'Get my attendance history (paginated)' })
  getMyHistory(@CurrentUser() user: AuthUser, @Query() query: ListAttendanceDto) {
    return this.attendanceService.getMyHistory(user.id, user.organizationId, query);
  }

  // ── Admin ─────────────────────────────────────────────────────

  @Get()
  @Permissions(PERMISSIONS.STAFF.MANAGE_ATTENDANCE)
  @ApiOperation({ summary: 'List all org attendance (admin)' })
  adminList(@CurrentUser() user: AuthUser, @Query() query: ListOrgAttendanceDto) {
    return this.attendanceService.adminListAttendance(user.organizationId, query);
  }

  @Get('overview/today')
  @Permissions(PERMISSIONS.STAFF.MANAGE_ATTENDANCE)
  @ApiOperation({ summary: "Today's attendance overview" })
  todayOverview(@CurrentUser() user: AuthUser) {
    return this.attendanceService.adminGetTodayOverview(user.organizationId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.STAFF.MANAGE_ATTENDANCE)
  @ApiOperation({ summary: 'Get attendance record by ID (admin)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attendanceService.adminGetOne(user.organizationId, id);
  }

  @Patch(':id/correct')
  @Permissions(PERMISSIONS.STAFF.CORRECT_ATTENDANCE)
  @ApiOperation({ summary: 'Admin correction of attendance record' })
  correct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CorrectAttendanceDto,
  ) {
    return this.attendanceService.adminCorrect(user.id, user.organizationId, id, dto);
  }
}
