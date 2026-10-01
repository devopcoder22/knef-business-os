import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import type { Prisma } from '@prisma/client';
import { PlanType, PlanStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreatePlanDto, UpdatePlanDto, ListPlansDto } from './dto/planner.dto';

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPlans(organizationId: string, query: ListPlansDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (query.status) where['status'] = query.status;
    if (query.type) where['type'] = query.type;
    if (query.ownerId) where['ownerId'] = query.ownerId;

    const [data, total] = await Promise.all([
      this.prisma.plan.findMany({
        where,
        skip,
        take: limit,
        include: {
          steps: { select: { id: true, title: true, status: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
          _count: { select: { steps: true, taskLinks: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.plan.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, organizationId },
      include: {
        steps: {
          include: {
            taskLinks: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        taskLinks: true,
        template: { select: { id: true, name: true } },
      },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(organizationId: string, dto: CreatePlanDto, createdBy: string) {
    const plan = await this.prisma.plan.create({
      data: {
        id: createId(),
        organizationId,
        ownerId: dto.ownerId ?? createdBy,
        title: dto.title,
        description: dto.description ?? null,
        objective: dto.objective ?? null,
        type: (dto.type ?? 'PERSONAL') as PlanType,
        status: 'DRAFT' as PlanStatus,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        goalId: dto.goalId ?? null,
        templateId: dto.templateId ?? null,
        createdBy,
      },
    });

    await this.audit.log({
      organizationId,
      userId: createdBy,
      action: 'PLAN_CREATED',
      entity: 'Plan',
      entityId: plan.id,
      metadata: { title: dto.title, type: dto.type },
    });

    return plan;
  }

  async update(organizationId: string, id: string, dto: UpdatePlanDto, actorId: string) {
    const plan = await this.getPlanOrThrow(organizationId, id);

    const updated = await this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.objective !== undefined && { objective: dto.objective }),
        ...(dto.status !== undefined && { status: dto.status as PlanStatus }),
        ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
        ...(dto.targetDate !== undefined && { targetDate: new Date(dto.targetDate) }),
        ...(dto.goalId !== undefined && { goalId: dto.goalId }),
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
      },
    });

    await this.audit.log({
      organizationId,
      userId: actorId,
      action: 'PLAN_UPDATED',
      entity: 'Plan',
      entityId: id,
      metadata: { changes: dto, previousStatus: plan.status },
    });

    return updated;
  }

  async delete(organizationId: string, id: string, actorId: string) {
    const plan = await this.getPlanOrThrow(organizationId, id);
    const status = plan.status;

    if (status === 'ACTIVE') {
      throw new BadRequestException('Cannot delete an active plan. Pause it first.');
    }

    await this.prisma.plan.delete({ where: { id } });

    await this.audit.log({
      organizationId,
      userId: actorId,
      action: 'PLAN_DELETED',
      entity: 'Plan',
      entityId: id,
    });
  }

  async approve(organizationId: string, id: string, actorId: string, comment?: string) {
    const plan = await this.getPlanOrThrow(organizationId, id);
    const status = plan.status;

    if (status !== 'REVIEW' && status !== 'DRAFT') {
      throw new BadRequestException(`Plan in status "${status}" cannot be approved`);
    }

    const updated = await this.prisma.plan.update({
      where: { id },
      data: {
        status: 'APPROVED' as PlanStatus,
        approvedBy: actorId,
        approvedAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId,
      userId: actorId,
      action: 'PLAN_APPROVED',
      entity: 'Plan',
      entityId: id,
      metadata: { comment },
    });

    return updated;
  }

  async reject(organizationId: string, id: string, actorId: string, reason: string) {
    await this.getPlanOrThrow(organizationId, id);

    const updated = await this.prisma.plan.update({
      where: { id },
      data: { status: 'DRAFT' as PlanStatus },
    });

    await this.audit.log({
      organizationId,
      userId: actorId,
      action: 'PLAN_REJECTED',
      entity: 'Plan',
      entityId: id,
      metadata: { reason },
    });

    return updated;
  }

  async pause(organizationId: string, id: string, actorId: string) {
    await this.assertStatus(organizationId, id, 'ACTIVE');

    const updated = await this.prisma.plan.update({
      where: { id },
      data: { status: 'PAUSED' as PlanStatus },
    });

    await this.audit.log({
      organizationId,
      userId: actorId,
      action: 'PLAN_PAUSED',
      entity: 'Plan',
      entityId: id,
    });

    return updated;
  }

  async resume(organizationId: string, id: string, actorId: string) {
    await this.assertStatus(organizationId, id, 'PAUSED');

    const updated = await this.prisma.plan.update({
      where: { id },
      data: { status: 'ACTIVE' as PlanStatus },
    });

    await this.audit.log({
      organizationId,
      userId: actorId,
      action: 'PLAN_RESUMED',
      entity: 'Plan',
      entityId: id,
    });

    return updated;
  }

  // ── Templates ──────────────────────────────────────────────────

  async listTemplates(organizationId: string) {
    return this.prisma.planTemplate.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(organizationId: string, dto: { name: string; description?: string; type?: string; structure: Record<string, unknown> }, createdBy: string) {
    return this.prisma.planTemplate.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
        type: (dto.type ?? 'BUSINESS') as PlanType,
        structure: dto.structure as Prisma.InputJsonValue,
        isActive: true,
        createdBy,
      },
    });
  }

  async getPlanOrThrow(organizationId: string, id: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, organizationId },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  private async assertStatus(organizationId: string, id: string, expected: string) {
    const plan = await this.getPlanOrThrow(organizationId, id);
    const status = plan.status;
    if (status !== expected) {
      throw new BadRequestException(`Plan must be in "${expected}" status but is "${status}"`);
    }
    return plan;
  }
}
