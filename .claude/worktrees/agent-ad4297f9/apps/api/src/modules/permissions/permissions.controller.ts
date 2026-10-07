import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { SetOverrideDto } from './dto/set-override.dto';

@ApiTags('permissions')
@ApiBearerAuth('JWT')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('registry')
  @ApiOperation({ summary: 'Get all available permissions grouped by module' })
  getRegistry() {
    return this.permissionsService.getRegistry();
  }

  @Get('users/:userId/resolved')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Get resolved permissions for a user (role + overrides merged)' })
  getResolved(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.permissionsService.getResolvedPermissions(user.organizationId, userId);
  }

  @Get('users/:userId/overrides')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Get permission overrides for a user' })
  getOverrides(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.permissionsService.getUserOverrides(user.organizationId, userId);
  }

  @Post('users/:userId/overrides')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Set a permission override for a user (grant or deny)' })
  setOverride(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: SetOverrideDto,
  ) {
    return this.permissionsService.setOverride(
      user.organizationId,
      userId,
      dto,
      user.id,
    );
  }

  @Delete('users/:userId/overrides/:permission')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a permission override for a user' })
  removeOverride(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Param('permission') permission: string,
  ) {
    return this.permissionsService.removeOverride(user.organizationId, userId, permission);
  }
}
