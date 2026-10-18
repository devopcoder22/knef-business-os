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
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ListUsersDto } from './dto/list-users.dto';

@ApiTags('users')
@ApiBearerAuth('JWT')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @ApiOperation({ summary: 'List all users in the organization' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListUsersDto) {
    return this.usersService.findAll(user.organizationId, query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.findOne(user.organizationId, user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.findOne(user.organizationId, id);
  }

  @Post('invite')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @ApiOperation({ summary: 'Invite a new user to the organization' })
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteUserDto) {
    return this.usersService.invite(user.organizationId, user, dto);
  }

  @Patch(':id/profile')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @ApiOperation({ summary: 'Update a user profile (admin)' })
  updateUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { firstName?: string; lastName?: string; phone?: string; avatarUrl?: string },
  ) {
    return this.usersService.updateUserAdmin(user.organizationId, id, body, user);
  }

  @Patch(':id/activate')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a user' })
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.toggleActive(user.organizationId, id, true, user);
  }

  @Patch(':id/deactivate')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a user' })
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.toggleActive(user.organizationId, id, false, user);
  }

  @Post(':id/roles')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Assign role to user' })
  assignRole(
    @CurrentUser() user: AuthUser,
    @Param('id') userId: string,
    @Body() body: { roleId: string; locationId?: string },
  ) {
    return this.usersService.assignRole(
      user.organizationId,
      userId,
      body.roleId,
      body.locationId ?? null,
    );
  }

  @Delete(':id/roles/:userRoleId')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Remove role from user' })
  removeRole(
    @CurrentUser() user: AuthUser,
    @Param('id') userId: string,
    @Param('userRoleId') userRoleId: string,
  ) {
    return this.usersService.removeRole(user.organizationId, userId, userRoleId);
  }

  @Post(':id/send-password-reset')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset email to user (admin)' })
  sendPasswordReset(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    return this.usersService.sendPasswordReset(user.organizationId, id, appUrl, user);
  }

  @Post(':id/request-email-change')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request email change — sends verification code to new email' })
  requestEmailChange(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { newEmail: string },
  ) {
    return this.usersService.requestEmailChange(user.organizationId, id, body.newEmail, user);
  }

  @Post(':id/confirm-email-change')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm email change with verification code' })
  confirmEmailChange(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { code: string },
  ) {
    return this.usersService.confirmEmailChange(user.organizationId, id, body.code, user);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user permanently (super admin)' })
  deleteUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.deleteUser(user.organizationId, id, user);
  }
}
