import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FeatureFlagsService } from './feature-flags.service';
import { UserFeatureFlagsService } from './user-feature-flags.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { ToggleFlagDto } from './dto/toggle-flag.dto';

@ApiTags('feature-flags')
@ApiBearerAuth('JWT')
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly userFeatureFlagsService: UserFeatureFlagsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all feature flags for the organization' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.featureFlagsService.findAll(user.organizationId);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get a specific feature flag' })
  findOne(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    return this.featureFlagsService.findOne(user.organizationId, key);
  }

  @Patch(':key')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_FEATURE_FLAGS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable or disable a feature flag' })
  toggle(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: ToggleFlagDto,
  ) {
    return this.featureFlagsService.toggle(
      user.organizationId,
      key,
      dto.isEnabled,
      user.id,
    );
  }

  @Get('users/:userId')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_FEATURE_FLAGS)
  @ApiOperation({ summary: 'Get user feature flag overrides' })
  getUserFlags(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.userFeatureFlagsService.getUserFlags(user.organizationId, userId);
  }

  @Get('users/:userId/effective')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_FEATURE_FLAGS)
  @ApiOperation({ summary: 'Get effective feature access for a user (org + user overrides merged)' })
  getEffectiveFlags(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.userFeatureFlagsService.getEffectiveFlags(user.organizationId, userId);
  }

  @Patch('users/:userId/:key')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_FEATURE_FLAGS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set user feature flag override (INHERIT | ENABLED | DISABLED)' })
  setUserFlag(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Param('key') key: string,
    @Body() body: { state: string },
  ) {
    return this.userFeatureFlagsService.setUserFlag(
      user.organizationId,
      userId,
      key,
      body.state,
      user.id,
    );
  }

  @Delete('users/:userId/:key')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_FEATURE_FLAGS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset user feature flag to inherited state' })
  removeUserFlag(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Param('key') key: string,
  ) {
    return this.userFeatureFlagsService.removeUserFlag(user.organizationId, userId, key, user.id);
  }
}
