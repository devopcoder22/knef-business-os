import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BrandsService } from './brands.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { ListBrandsDto } from './dto/list-brands.dto';

@ApiTags('brands')
@ApiBearerAuth('JWT')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'List all brands (paginated)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListBrandsDto) {
    return this.brandsService.findAll(user.organizationId, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'Get brand by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.brandsService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.PRODUCTS.CREATE)
  @ApiOperation({ summary: 'Create a new brand' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBrandDto) {
    return this.brandsService.create(user.organizationId, dto, user.id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PRODUCTS.EDIT)
  @ApiOperation({ summary: 'Update a brand' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.brandsService.update(user.organizationId, id, dto, user.id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.PRODUCTS.DELETE)
  @ApiOperation({ summary: 'Delete a brand' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.brandsService.remove(user.organizationId, id);
  }
}
