import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('admin')
@ApiBearerAuth('JWT')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @ApiOperation({ summary: 'Admin overview stats' })
  getOverview(@CurrentUser() user: AuthUser) {
    return this.adminService.getOverviewStats(user.organizationId);
  }

  @Get('security-events')
  @Permissions(PERMISSIONS.ADMIN.VIEW_SECURITY)
  @ApiOperation({ summary: 'Recent security-relevant audit events' })
  getSecurityEvents(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getSecurityEvents(
      user.organizationId,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
    );
  }

  @Get('api-keys')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_API_KEYS)
  @ApiOperation({ summary: 'List all API keys for the organization' })
  listApiKeys(@CurrentUser() user: AuthUser) {
    return this.adminService.listApiKeys(user.organizationId);
  }

  @Delete('api-keys/:id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_API_KEYS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revokeApiKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    try {
      await this.adminService.revokeApiKey(user.organizationId, id);
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'NOT_FOUND') {
        throw new NotFoundException('API key not found');
      }
      throw e;
    }
  }

  @Get('worker-health')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @ApiOperation({ summary: 'Worker queue health and stats' })
  getWorkerHealth(@CurrentUser() _user: AuthUser) {
    return this.adminService.getWorkerHealth();
  }
}
