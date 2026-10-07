import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('categories')
@ApiBearerAuth('JWT')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'Get all categories as a tree' })
  findTree(@CurrentUser() user: AuthUser) {
    return this.categoriesService.findTree(user.organizationId);
  }

  @Get('flat')
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'Get all categories as flat list' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.categoriesService.findAll(user.organizationId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'Get category by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.categoriesService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.PRODUCTS.CREATE)
  @ApiOperation({ summary: 'Create a new category' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(user.organizationId, dto, user.id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PRODUCTS.EDIT)
  @ApiOperation({ summary: 'Update a category' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.organizationId, id, dto, user.id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.PRODUCTS.DELETE)
  @ApiOperation({ summary: 'Delete a category' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.categoriesService.remove(user.organizationId, id);
  }
}
