import { Controller, Get, Post, Patch, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class SettingsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  group?: string;
}

@ApiTags('settings')
@ApiBearerAuth('JWT')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS.VIEW)
  @ApiOperation({ summary: 'Get all system settings (admin view — all settings)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: SettingsQueryDto) {
    return this.settingsService.findAllAdmin(user.organizationId);
  }

  @Get('public')
  @ApiOperation({ summary: 'Get public settings (no admin perm required)' })
  findPublic(@CurrentUser() user: AuthUser, @Query() query: SettingsQueryDto) {
    return this.settingsService.findAll(user.organizationId, query.group, false);
  }

  @Patch()
  @Permissions(PERMISSIONS.SETTINGS.EDIT)
  @ApiOperation({ summary: 'Update one or more system settings' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(user.organizationId, dto, user.id);
  }

  @Get('storefront')
  @Permissions(PERMISSIONS.SETTINGS.VIEW)
  @ApiOperation({ summary: 'Get storefront settings for admin panel' })
  getStorefrontSettings(@CurrentUser() user: AuthUser) {
    return this.settingsService.findByGroup(user.organizationId, 'storefront');
  }

  @Post('storefront')
  @Permissions(PERMISSIONS.SETTINGS.EDIT)
  @ApiOperation({ summary: 'Save storefront settings (upsert)' })
  saveStorefrontSettings(
    @CurrentUser() user: AuthUser,
    @Body() body: { settings: Array<{ key: string; value: string; label: string }> },
  ) {
    const entries = body.settings.map((s) => ({
      ...s,
      group: 'storefront',
      isPublic: true,
    }));
    return this.settingsService.upsertMany(user.organizationId, entries, user.id);
  }
}
