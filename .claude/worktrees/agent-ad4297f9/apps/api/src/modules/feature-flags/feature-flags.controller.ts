import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FeatureFlagsService } from './feature-flags.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { ToggleFlagDto } from './dto/toggle-flag.dto';

@ApiTags('feature-flags')
@ApiBearerAuth('JWT')
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

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
}
