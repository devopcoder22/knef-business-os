import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AutomationConditionEvaluatorService } from './automation-condition-evaluator.service';
import { isValidTrigger } from './automation-trigger.registry';
import { isValidActionType, validateActionParams } from './automation-action.registry';
import type {
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto,
  ListAutomationRulesDto,
  ListExecutionsDto,
} from './dto/automation-rule.dto';
import type { Prisma } from '@prisma/client';

const MAX_ACTIONS_PER_RULE = 10;
const MAX_CONDITIONS_DEPTH = 5;

function validateActionArray(actions: unknown[]): string[] {
  const errors: string[] = [];
  if (actions.length > MAX_ACTIONS_PER_RULE) {
    errors.push(`Maximum ${MAX_ACTIONS_PER_RULE} actions per rule`);
    return errors;
  }

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i] as Record<string, unknown>;
    if (!a || typeof a !== 'object') { errors.push(`actions[${i}]: must be an object`); continue; }
    if (!a.type || typeof a.type !== 'string') { errors.push(`actions[${i}].type: required`); continue; }
    if (!isValidActionType(a.type)) { errors.push(`actions[${i}].type: '${a.type}' is not a valid action type`); continue; }
    const params = (a.params ?? {}) as Record<string, unknown>;
    const paramError = validateActionParams(a.type, params);
    if (paramError) errors.push(`actions[${i}]: ${paramError}`);
  }
  return errors;
}

function countConditionDepth(nodes: unknown[], depth = 0): number {
  if (depth > MAX_CONDITIONS_DEPTH) return depth;
  let max = depth;
  for (const node of nodes) {
    const n = node as Record<string, unknown>;
    if ('conditions' in n && Array.isArray(n.conditions)) {
      const d = countConditionDepth(n.conditions as unknown[], depth + 1);
      if (d > max) max = d;
    }
  }
  return max;
}

@Injectable()
export class AutomationRulesService {
  private readonly logger = new Logger(AutomationRulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly conditionEvaluator: AutomationConditionEvaluatorService,
  ) {}

  async findAll(organizationId: string, query: ListAutomationRulesDto) {
    const { page = 1, limit = 50, trigger, isActive, locationId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AutomationRuleWhereInput = { organizationId };
    if (trigger) where.trigger = trigger;
    if (isActive !== undefined) where.isActive = isActive;
    if (locationId !== undefined) where.locationId = locationId;

    const [data, total] = await Promise.all([
      this.prisma.automationRule.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { executions: true } } },
      }),
      this.prisma.automationRule.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { executions: true } } },
    });
    if (!rule) throw new NotFoundException('Automation rule not found');
    return rule;
  }

  async create(
    organizationId: string,
    dto: CreateAutomationRuleDto,
    userId: string,
    userLocationIds: string[] | null,
  ) {
    // Trigger must be in registry
    if (!isValidTrigger(dto.trigger)) {
      throw new BadRequestException(`Unknown trigger: ${dto.trigger}`);
    }

    // Location scope check: if user is location-scoped, they can only create scoped rules
    if (dto.locationId && userLocationIds !== null && !userLocationIds.includes(dto.locationId)) {
      throw new ForbiddenException('Not authorized to create rules for this location');
    }

    // Validate conditions
    const conditions = (dto.conditions ?? []) as unknown[];
    if (countConditionDepth(conditions) > MAX_CONDITIONS_DEPTH) {
      throw new BadRequestException(`Conditions may not exceed ${MAX_CONDITIONS_DEPTH} levels deep`);
    }
    const condErrors = this.conditionEvaluator.validateConditions(conditions);
    if (condErrors.length > 0) {
      throw new BadRequestException(`Invalid conditions: ${condErrors.join('; ')}`);
    }

    // Validate actions
    const actions = (dto.actions ?? []) as unknown[];
    const actionErrors = validateActionArray(actions);
    if (actionErrors.length > 0) {
      throw new BadRequestException(`Invalid actions: ${actionErrors.join('; ')}`);
    }

    const rule = await this.prisma.automationRule.create({
      data: {
        organizationId,
        locationId: dto.locationId ?? null,
        name: dto.name,
        description: dto.description,
        trigger: dto.trigger,
        conditions: (conditions as Prisma.InputJsonValue) ?? [],
        actions: (actions as Prisma.InputJsonValue) ?? [],
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_RULE_CREATED',
      entity: 'AutomationRule',
      entityId: rule.id,
      newValues: { name: rule.name, trigger: rule.trigger, isActive: rule.isActive },
    });

    this.logger.log(`Rule ${rule.id} created by user ${userId} (org=${organizationId})`);
    return rule;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateAutomationRuleDto,
    userId: string,
    userLocationIds: string[] | null,
  ) {
    const existing = await this.findOne(organizationId, id);

    if (dto.trigger && !isValidTrigger(dto.trigger)) {
      throw new BadRequestException(`Unknown trigger: ${dto.trigger}`);
    }

    if (dto.locationId && userLocationIds !== null && !userLocationIds.includes(dto.locationId)) {
      throw new ForbiddenException('Not authorized to set this location on a rule');
    }

    const conditions = dto.conditions !== undefined ? (dto.conditions as unknown[]) : undefined;
    if (conditions !== undefined) {
      if (countConditionDepth(conditions) > MAX_CONDITIONS_DEPTH) {
        throw new BadRequestException(`Conditions may not exceed ${MAX_CONDITIONS_DEPTH} levels deep`);
      }
      const errs = this.conditionEvaluator.validateConditions(conditions);
      if (errs.length > 0) throw new BadRequestException(`Invalid conditions: ${errs.join('; ')}`);
    }

    const actions = dto.actions !== undefined ? (dto.actions as unknown[]) : undefined;
    if (actions !== undefined) {
      const errs = validateActionArray(actions);
      if (errs.length > 0) throw new BadRequestException(`Invalid actions: ${errs.join('; ')}`);
    }

    const updated = await this.prisma.automationRule.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        trigger: dto.trigger,
        locationId: dto.locationId,
        conditions: conditions !== undefined ? (conditions as Prisma.InputJsonValue) : undefined,
        actions: actions !== undefined ? (actions as Prisma.InputJsonValue) : undefined,
        isActive: dto.isActive,
        updatedBy: userId,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_RULE_UPDATED',
      entity: 'AutomationRule',
      entityId: id,
      oldValues: { name: existing.name, trigger: existing.trigger, isActive: existing.isActive },
      newValues: { name: updated.name, trigger: updated.trigger, isActive: updated.isActive },
    });

    return updated;
  }

  async setActive(
    organizationId: string,
    id: string,
    isActive: boolean,
    userId: string,
  ) {
    const rule = await this.findOne(organizationId, id);
    const updated = await this.prisma.automationRule.update({
      where: { id },
      data: { isActive, updatedBy: userId },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: isActive ? 'AUTOMATION_RULE_ACTIVATED' : 'AUTOMATION_RULE_DEACTIVATED',
      entity: 'AutomationRule',
      entityId: id,
      oldValues: { isActive: rule.isActive },
      newValues: { isActive },
    });

    return updated;
  }

  async delete(organizationId: string, id: string, userId: string) {
    const rule = await this.findOne(organizationId, id);
    await this.prisma.automationRule.delete({ where: { id } });

    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_RULE_DELETED',
      entity: 'AutomationRule',
      entityId: id,
      oldValues: { name: rule.name, trigger: rule.trigger },
    });
  }

  async findMatchingRules(organizationId: string, trigger: string, locationId?: string | null) {
    return this.prisma.automationRule.findMany({
      where: {
        organizationId,
        trigger,
        isActive: true,
        OR: [
          { locationId: null },
          ...(locationId ? [{ locationId }] : []),
        ],
      },
    });
  }

  async findExecutions(organizationId: string, query: ListExecutionsDto) {
    const { page = 1, limit = 50, ruleId, status, eventType } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AutomationExecutionWhereInput = { organizationId };
    if (ruleId) where.ruleId = ruleId;
    if (status) where.status = status;
    if (eventType) where.eventType = eventType;

    const [data, total] = await Promise.all([
      this.prisma.automationExecution.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
        include: { rule: { select: { name: true, trigger: true } } },
      }),
      this.prisma.automationExecution.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findExecution(organizationId: string, id: string) {
    const ex = await this.prisma.automationExecution.findFirst({
      where: { id, organizationId },
      include: { rule: { select: { name: true, trigger: true } } },
    });
    if (!ex) throw new NotFoundException('Automation execution not found');
    return ex;
  }
}
