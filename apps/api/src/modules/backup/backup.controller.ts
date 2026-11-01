import { Controller, Post, Get, Put, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BackupService } from './backup.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('backup')
@ApiBearerAuth('JWT')
@Controller('admin/backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('config')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @ApiOperation({ summary: 'Get backup configuration' })
  getConfig() {
    return this.backupService.getConfig();
  }

  @Put('config')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @ApiOperation({ summary: 'Update backup configuration' })
  setConfig(
    @CurrentUser() user: AuthUser,
    @Body() body: { enabled?: boolean; schedule?: string; retentionDays?: number },
  ) {
    return this.backupService.setConfig(user.organizationId, body);
  }

  @Get()
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @ApiOperation({ summary: 'List recent backups' })
  list() {
    return this.backupService.listBackups();
  }

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @ApiOperation({ summary: 'Trigger manual backup' })
  trigger(@CurrentUser() user: AuthUser) {
    return this.backupService.triggerBackup(user.id);
  }
}
