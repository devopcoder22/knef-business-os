import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { ListTasksDto } from './dto/list-tasks.dto';
import type { CreateCommentDto } from './dto/create-comment.dto';
import type { CreateChecklistDto, UpdateChecklistDto } from './dto/create-checklist.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(organizationId: string, query: ListTasksDto) {
    const { page = 1, limit = 50, status, priority, assigneeId, goalId, customerId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = { organizationId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeId) where.assigneeId = assigneeId;
    if (goalId) where.goalId = goalId;
    if (customerId) where.customerId = customerId;

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
          creator: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { subtasks: true, comments: true, checklists: true } },
          checklists: { select: { isCompleted: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        subtasks: {
          select: { id: true, title: true, status: true, priority: true, assigneeId: true },
        },
        comments: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        checklists: { orderBy: { sortOrder: 'asc' } },
        goal: { select: { id: true, title: true } },
        parent: { select: { id: true, title: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(organizationId: string, dto: CreateTaskDto, creatorId: string) {
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
        select: { id: true },
      });
      if (!customer) throw new BadRequestException('Customer not found in this organization');
    }

    const task = await this.prisma.task.create({
      data: {
        id: createId(),
        organizationId,
        title: dto.title,
        description: dto.description,
        status: dto.status ?? TaskStatus.TODO,
        priority: dto.priority ?? 'MEDIUM',
        assigneeId: dto.assigneeId,
        creatorId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        estimatedHours: dto.estimatedHours ? new Prisma.Decimal(dto.estimatedHours) : undefined,
        tags: dto.tags ?? [],
        parentId: dto.parentId,
        goalId: dto.goalId,
        customerId: dto.customerId,
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.eventEmitter.emit('task.created', {
      organizationId,
      taskId: task.id,
      title: task.title,
      priority: task.priority,
      assigneeId: task.assigneeId,
      creatorId,
      dueDate: task.dueDate?.toISOString() ?? null,
    });

    return task;
  }

  async update(organizationId: string, id: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id, organizationId } });
    if (!task) throw new NotFoundException('Task not found');

    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        estimatedHours: dto.estimatedHours ? new Prisma.Decimal(dto.estimatedHours) : undefined,
        tags: dto.tags,
        parentId: dto.parentId,
        goalId: dto.goalId,
      },
    });
  }

  async softDelete(organizationId: string, id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, organizationId } });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.task.update({ where: { id }, data: { status: TaskStatus.CANCELLED } });
  }

  async complete(organizationId: string, id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, organizationId } });
    if (!task) throw new NotFoundException('Task not found');
    const completed = await this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.DONE, completedAt: new Date() },
    });

    this.eventEmitter.emit('task.completed', {
      organizationId,
      taskId: completed.id,
      title: completed.title,
      priority: completed.priority,
      assigneeId: completed.assigneeId,
      completedAt: completed.completedAt?.toISOString() ?? new Date().toISOString(),
    });

    return completed;
  }

  async addComment(organizationId: string, taskId: string, dto: CreateCommentDto, userId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, organizationId } });
    if (!task) throw new NotFoundException('Task not found');

    return this.prisma.taskComment.create({
      data: {
        id: createId(),
        taskId,
        userId,
        content: dto.content,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async addChecklist(organizationId: string, taskId: string, dto: CreateChecklistDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, organizationId } });
    if (!task) throw new NotFoundException('Task not found');

    const maxOrder = await this.prisma.taskChecklist.aggregate({
      where: { taskId },
      _max: { sortOrder: true },
    });

    return this.prisma.taskChecklist.create({
      data: {
        id: createId(),
        taskId,
        text: dto.text,
        sortOrder: dto.sortOrder ?? ((maxOrder._max.sortOrder ?? 0) + 1),
      },
    });
  }

  async updateChecklist(
    organizationId: string,
    taskId: string,
    checklistId: string,
    dto: UpdateChecklistDto,
  ) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, organizationId } });
    if (!task) throw new NotFoundException('Task not found');

    const checklist = await this.prisma.taskChecklist.findFirst({
      where: { id: checklistId, taskId },
    });
    if (!checklist) throw new NotFoundException('Checklist item not found');

    return this.prisma.taskChecklist.update({
      where: { id: checklistId },
      data: {
        text: dto.text,
        isCompleted: dto.isCompleted,
        completedAt: dto.isCompleted ? new Date() : null,
      },
    });
  }
}
