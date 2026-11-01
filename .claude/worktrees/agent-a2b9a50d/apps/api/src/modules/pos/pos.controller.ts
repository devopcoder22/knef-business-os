import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { POSService } from './pos.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { POSSaleDto } from './dto/pos-sale.dto';

@ApiTags('pos')
@ApiBearerAuth('JWT')
@Controller('pos')
export class POSController {
  constructor(private readonly posService: POSService) {}

  @Post('sessions/open')
  @Permissions(PERMISSIONS.POS.OPEN_SESSION)
  @ApiOperation({ summary: 'Open a POS session' })
  openSession(@CurrentUser() user: AuthUser, @Body() dto: OpenSessionDto) {
    return this.posService.openSession(user.organizationId, user.id, dto);
  }

  @Get('sessions/current')
  @Permissions(PERMISSIONS.POS.ACCESS)
  @ApiOperation({ summary: 'Get current open POS session for current user' })
  getCurrentSession(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.posService.getCurrentSession(user.organizationId, user.id, locationId);
  }

  @Post('sessions/:id/close')
  @Permissions(PERMISSIONS.POS.CLOSE_SESSION)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a POS session' })
  closeSession(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CloseSessionDto,
  ) {
    return this.posService.closeSession(user.organizationId, id, user.id, dto);
  }

  @Post('sessions/:id/sale')
  @Permissions(PERMISSIONS.POS.ACCESS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process a POS sale' })
  processSale(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: POSSaleDto,
  ) {
    return this.posService.processSale(user.organizationId, id, user.id, dto);
  }

  @Get('sessions/:id/summary')
  @Permissions(PERMISSIONS.POS.ACCESS)
  @ApiOperation({ summary: 'Get session summary' })
  getSessionSummary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.posService.getSessionSummary(user.organizationId, id);
  }
}
