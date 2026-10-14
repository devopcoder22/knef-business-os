import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@ApiTags('organizations')
@ApiBearerAuth('JWT')
@Controller('organization')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('branding')
  @Public()
  @ApiOperation({ summary: 'Get public organization branding (no auth required)' })
  publicBranding() {
    return this.organizationsService.publicBranding();
  }

  @Get()
  @ApiOperation({ summary: 'Get current organization details' })
  findOne(@CurrentUser() user: AuthUser) {
    return this.organizationsService.findOne(user.organizationId);
  }

  @Patch()
  @Permissions(PERMISSIONS.SETTINGS.EDIT)
  @ApiOperation({ summary: 'Update organization settings' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(user.organizationId, dto);
  }
}
