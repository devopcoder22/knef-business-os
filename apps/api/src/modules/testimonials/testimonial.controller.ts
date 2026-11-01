import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsArray, IsNumber, ValidateNested, Min, Max, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TestimonialService } from './testimonial.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export class CreateTestimonialBodyDto {
  @ApiProperty()
  @IsString()
  customerName!: string;

  @ApiProperty()
  @IsString()
  quote!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTestimonialBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quote?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetActiveBodyDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class ReorderItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsInt()
  displayOrder!: number;
}

export class ReorderBodyDto {
  @ApiProperty({ type: [ReorderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}

// ── Controller ────────────────────────────────────────────────────────────────

@ApiTags('testimonials')
@ApiBearerAuth('JWT')
@Controller('testimonials')
export class TestimonialController {
  constructor(private readonly testimonialService: TestimonialService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS.VIEW)
  @ApiOperation({ summary: 'List all testimonials (admin)' })
  list(@CurrentUser() user: AuthUser) {
    return this.testimonialService.list(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.ECOMMERCE.MANAGE)
  @ApiOperation({ summary: 'Create a testimonial' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTestimonialBodyDto,
  ) {
    return this.testimonialService.create(user.organizationId, dto, user.id);
  }

  @Patch('reorder')
  @Permissions(PERMISSIONS.ECOMMERCE.MANAGE)
  @ApiOperation({ summary: 'Bulk update testimonial display order' })
  reorder(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReorderBodyDto,
  ) {
    return this.testimonialService.reorder(user.organizationId, dto.items, user.id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ECOMMERCE.MANAGE)
  @ApiOperation({ summary: 'Update a testimonial' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTestimonialBodyDto,
  ) {
    return this.testimonialService.update(user.organizationId, id, dto, user.id);
  }

  @Patch(':id/active')
  @Permissions(PERMISSIONS.ECOMMERCE.MANAGE)
  @ApiOperation({ summary: 'Toggle testimonial active status' })
  setActive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetActiveBodyDto,
  ) {
    return this.testimonialService.setActive(
      user.organizationId,
      id,
      dto.isActive,
      user.id,
    );
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ECOMMERCE.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a testimonial' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.testimonialService.remove(user.organizationId, id, user.id);
  }
}
