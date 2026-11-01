import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { ListAuditDto } from './dto/list-audit.dto';

@ApiTags('audit')
@ApiBearerAuth('JWT')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions(PERMISSIONS.ADMIN.VIEW_AUDIT)
  @ApiOperation({ summary: 'Get paginated audit log (admin only)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListAuditDto) {
    return this.auditService.findAll(user.organizationId, query);
  }
}
