import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { CredentialService } from './credential.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

class SetCredentialDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  value!: string;
}

@ApiTags('credentials')
@ApiBearerAuth('JWT')
@Controller('credentials')
export class CredentialController {
  constructor(private readonly credentials: CredentialService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS.MANAGE_INTEGRATIONS)
  @ApiOperation({ summary: 'List all integration credential slots with status (no values returned)' })
  list() {
    return this.credentials.list();
  }

  @Put(':key')
  @Permissions(PERMISSIONS.SETTINGS.MANAGE_INTEGRATIONS)
  @ApiOperation({ summary: 'Set (encrypt and store) a credential value' })
  async set(
    @Param('key') key: string,
    @Body() dto: SetCredentialDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.credentials.set(key, dto.value, user.id);
    return { message: 'Credential saved' };
  }

  @Delete(':key')
  @Permissions(PERMISSIONS.SETTINGS.MANAGE_INTEGRATIONS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a credential from DB (env var fallback still applies)' })
  async remove(@Param('key') key: string) {
    await this.credentials.delete(key);
  }
}
