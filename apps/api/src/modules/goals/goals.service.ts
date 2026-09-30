import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateGoalDto } from './dto/create-goal.dto';
import type { UpdateGoalDto } from './dto/update-goal.dto';
import type { ListGoalsDto } from './dto/list-goals.dto';
import type { AddProgressDto } from './dto/add-progress.dto';
import type { CreateKpiDto, UpdateKpiDto } from './dto/create-kpi.dto';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, query: ListGoalsDto) {
    const { page = 1, limit = 20, status, ownerId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.GoalWhereInput = { organizationId };
    if (status) where.status = status;
    if (ownerId) where.ownerId = ownerId;

    const [data, total] = await Promise.all([
      this.prisma.goal.findMany({
        where,
        skip,
        take: limit,
        include: {
          kpis: true,
          _count: { select: { tasks: true, progresses: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.goal.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, organizationId },
      include: {
        kpis: true,
        progresses: {
          orderBy: { recordedAt: 'desc' },
          take: 10,
        },
        tasks: {
          select: { id: true, title: true, status: true, priority: true, assigneeId: true, dueDate: true },
          orderBy: { createdAt: 'desc' },
        },
        parent: { select: { id: true, title: true } },
        children: { select: { id: true, title: true, status: true, progress: true } },
      },
    });
    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }

  async create(organizationId: string, dto: CreateGoalDto) {
    return this.prisma.goal.create({
      data: {
        id: createId(),
        organizationId,
        title: dto.title,
        description: dto.description,
        status: dto.status ?? 'ACTIVE',
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        ownerId: dto.ownerId,
        parentId: dto.parentId,
        progress: dto.progress ?? 0,
        notes: dto.notes,
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateGoalDto) {
    const goal = await this.prisma.goal.findFirst({ where: { id, organizationId } });
    if (!goal) throw new NotFoundException('Goal not found');

    return this.prisma.goal.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        ownerId: dto.ownerId,
        parentId: dto.parentId,
        progress: dto.progress,
        notes: dto.notes,
      },
    });
  }

  async addProgress(organizationId: string, goalId: string, dto: AddProgressDto, userId: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, organizationId } });
    if (!goal) throw new NotFoundException('Goal not found');

    const [progress] = await this.prisma.$transaction([
      this.prisma.goalProgress.create({
        data: {
          id: createId(),
          goalId,
          value: dto.value,
          notes: dto.notes,
          recordedBy: userId,
          recordedAt: new Date(),
        },
      }),
      this.prisma.goal.update({
        where: { id: goalId },
        data: { progress: dto.value },
      }),
    ]);

    return progress;
  }

  async addKpi(organizationId: string, goalId: string, dto: CreateKpiDto) {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, organizationId } });
    if (!goal) throw new NotFoundException('Goal not found');

    return this.prisma.goalKPI.create({
      data: {
        id: createId(),
        goalId,
        name: dto.name,
        description: dto.description,
        target: new Prisma.Decimal(dto.target),
        current: dto.current ? new Prisma.Decimal(dto.current) : new Prisma.Decimal(0),
        unit: dto.unit,
      },
    });
  }

  async updateKpi(organizationId: string, goalId: string, kpiId: string, dto: UpdateKpiDto) {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, organizationId } });
    if (!goal) throw new NotFoundException('Goal not found');

    const kpi = await this.prisma.goalKPI.findFirst({ where: { id: kpiId, goalId } });
    if (!kpi) throw new NotFoundException('KPI not found');

    return this.prisma.goalKPI.update({
      where: { id: kpiId },
      data: {
        current: dto.current ? new Prisma.Decimal(dto.current) : undefined,
        target: dto.target ? new Prisma.Decimal(dto.target) : undefined,
      },
    });
  }
}
