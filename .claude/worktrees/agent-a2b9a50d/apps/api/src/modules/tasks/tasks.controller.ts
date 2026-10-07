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
import { TasksService } from './tasks.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateChecklistDto, UpdateChecklistDto } from './dto/create-checklist.dto';

@ApiTags('tasks')
@ApiBearerAuth('JWT')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @Permissions(PERMISSIONS.TASKS.VIEW)
  @ApiOperation({ summary: 'List tasks (paginated)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListTasksDto) {
    return this.tasksService.findAll(user.organizationId, query);
  }

  @Post()
  @Permissions(PERMISSIONS.TASKS.CREATE)
  @ApiOperation({ summary: 'Create task' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.organizationId, dto, user.id);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.TASKS.VIEW)
  @ApiOperation({ summary: 'Get task detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasksService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.TASKS.MANAGE)
  @ApiOperation({ summary: 'Update task' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.TASKS.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel task (soft delete)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasksService.softDelete(user.organizationId, id);
  }

  @Post(':id/complete')
  @Permissions(PERMISSIONS.TASKS.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark task as done' })
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasksService.complete(user.organizationId, id);
  }

  @Post(':id/comments')
  @Permissions(PERMISSIONS.TASKS.CREATE)
  @ApiOperation({ summary: 'Add comment to task' })
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.tasksService.addComment(user.organizationId, id, dto, user.id);
  }

  @Post(':id/checklists')
  @Permissions(PERMISSIONS.TASKS.MANAGE)
  @ApiOperation({ summary: 'Add checklist item' })
  addChecklist(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateChecklistDto,
  ) {
    return this.tasksService.addChecklist(user.organizationId, id, dto);
  }

  @Patch(':id/checklists/:checklistId')
  @Permissions(PERMISSIONS.TASKS.MANAGE)
  @ApiOperation({ summary: 'Toggle checklist item' })
  updateChecklist(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('checklistId') checklistId: string,
    @Body() dto: UpdateChecklistDto,
  ) {
    return this.tasksService.updateChecklist(user.organizationId, id, checklistId, dto);
  }
}
