import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrintTemplatesService, CreatePrintTemplateDto, PrintTemplateType } from './print-templates.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('print-templates')
@ApiBearerAuth('JWT')
@Controller('print-templates')
export class PrintTemplatesController {
  constructor(private readonly printTemplatesService: PrintTemplatesService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS.PRINT_TEMPLATES)
  @ApiOperation({ summary: 'List print templates' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('templateType') templateType?: string,
  ) {
    return this.printTemplatesService.findAll(user.organizationId, templateType);
  }

  @Get('variables/:templateType')
  @Permissions(PERMISSIONS.SETTINGS.PRINT_TEMPLATES)
  @ApiOperation({ summary: 'Get available variables for a template type' })
  getVariables(@Param('templateType') templateType: PrintTemplateType) {
    return this.printTemplatesService.getAvailableVariables(templateType);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SETTINGS.PRINT_TEMPLATES)
  @ApiOperation({ summary: 'Get print template by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.printTemplatesService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.SETTINGS.PRINT_TEMPLATES)
  @ApiOperation({ summary: 'Create a new print template' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePrintTemplateDto) {
    return this.printTemplatesService.create(user.organizationId, dto, user.id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.SETTINGS.PRINT_TEMPLATES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a print template' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreatePrintTemplateDto>,
  ) {
    return this.printTemplatesService.update(user.organizationId, id, dto, user.id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.SETTINGS.PRINT_TEMPLATES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a print template' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.printTemplatesService.remove(user.organizationId, id);
  }
}
