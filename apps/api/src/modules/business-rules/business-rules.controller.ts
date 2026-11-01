import {
  Controller,
  Get,
  Patch,
  Body,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { POStatus, ExpenseStatus } from '@prisma/client';
import { BusinessRuleService } from './business-rules.service';
import { UpdateRulesDto } from './dto/business-rules.dto';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import type { RuleId } from './business-rules.types';

const PERCENT_RULE_KEYS: string[] = [
  'rules.sales.max_discount_percent',
  'rules.sales.min_margin_percent',
];

@ApiTags('Business Rules')
@ApiBearerAuth()
@Controller('business-rules')
export class BusinessRulesController {
  constructor(
    private readonly businessRuleService: BusinessRuleService,
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS.VIEW)
  async listRules(@CurrentUser() user: AuthUser) {
    const { data } = await this.settingsService.findAll(user.organizationId, 'rules', true);
    return { data };
  }

  @Patch()
  @Permissions(PERMISSIONS.SETTINGS.EDIT)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateRules(@CurrentUser() user: AuthUser, @Body() dto: UpdateRulesDto) {
    for (const setting of dto.settings) {
      const num = parseFloat(setting.value);
      if (isNaN(num) || !isFinite(num)) {
        throw new BadRequestException(`Invalid value for ${setting.key}: must be a numeric value`);
      }
      if (PERCENT_RULE_KEYS.includes(setting.key)) {
        if (num < 0 || num > 100) {
          throw new BadRequestException(`${setting.key} must be between 0 and 100`);
        }
      } else {
        if (num < 0) {
          throw new BadRequestException(`${setting.key} must be a non-negative number`);
        }
      }
    }

    const { data: oldSettings } = await this.settingsService.findAll(user.organizationId, 'rules', true);
    const oldValues = Object.fromEntries(
      (oldSettings as Array<{ key: string; value: string }>).map((s) => [s.key, s.value]),
    );

    const result = await this.settingsService.update(
      user.organizationId,
      { settings: dto.settings },
      user.id,
    );

    const newValues = Object.fromEntries(dto.settings.map((s) => [s.key, s.value]));
    void this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'BUSINESS_RULES_UPDATED',
      entity: 'BusinessRules',
      oldValues,
      newValues,
    });

    return result;
  }

  @Get('thresholds')
  @Permissions(PERMISSIONS.SETTINGS.VIEW)
  async getThresholds(@CurrentUser() user: AuthUser) {
    const thresholds = await this.businessRuleService.getAllThresholds(user.organizationId);
    return { data: thresholds };
  }

  @Get('approvals/queue')
  @Permissions(PERMISSIONS.SETTINGS.VIEW)
  async getApprovalQueue(@CurrentUser() user: AuthUser) {
    const orgId = user.organizationId;

    const [pendingPOs, pendingExpenses, thresholds] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { organizationId: orgId, status: POStatus.SUBMITTED },
        select: {
          id: true,
          reference: true,
          status: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          createdBy: true,
          supplier: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.expense.findMany({
        where: { organizationId: orgId, status: ExpenseStatus.PENDING },
        select: {
          id: true,
          reference: true,
          description: true,
          amount: true,
          currency: true,
          vendor: true,
          date: true,
          createdAt: true,
          submittedBy: true,
          category: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.businessRuleService.getAllThresholds(orgId),
    ]);

    const poThreshold = thresholds['rules.purchasing.approval_threshold_ngn' as RuleId];
    const expenseThreshold = thresholds['rules.expense.approval_threshold_ngn' as RuleId];

    return {
      purchaseOrders: pendingPOs.map((po) => ({
        ...po,
        totalAmount: Number(po.totalAmount),
        ruleCheck: {
          requiresApproval: Number(po.totalAmount) > poThreshold,
          threshold: poThreshold,
          observedValue: Number(po.totalAmount),
          ruleId: 'rules.purchasing.approval_threshold_ngn',
        },
      })),
      expenses: pendingExpenses.map((exp) => ({
        ...exp,
        amount: Number(exp.amount),
        ruleCheck: {
          requiresApproval: Number(exp.amount) > expenseThreshold,
          threshold: expenseThreshold,
          observedValue: Number(exp.amount),
          ruleId: 'rules.expense.approval_threshold_ngn',
        },
      })),
      stats: {
        totalPendingPOs: pendingPOs.length,
        totalPendingExpenses: pendingExpenses.length,
        highValuePOs: pendingPOs.filter((po) => Number(po.totalAmount) > poThreshold).length,
        highValueExpenses: pendingExpenses.filter((exp) => Number(exp.amount) > expenseThreshold).length,
      },
    };
  }

  @Get('approvals/history')
  @Permissions(PERMISSIONS.SETTINGS.VIEW)
  async getApprovalHistory(@CurrentUser() user: AuthUser) {
    const orgId = user.organizationId;

    const [resolvedPOs, resolvedExpenses] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: {
          organizationId: orgId,
          status: { in: [POStatus.APPROVED, POStatus.CANCELLED] },
        },
        select: {
          id: true,
          reference: true,
          status: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          createdBy: true,
          approvedBy: true,
          approvedAt: true,
          cancelledAt: true,
          cancelReason: true,
          supplier: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId: orgId,
          status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.REJECTED] },
        },
        select: {
          id: true,
          reference: true,
          description: true,
          amount: true,
          currency: true,
          vendor: true,
          date: true,
          status: true,
          createdAt: true,
          submittedBy: true,
          approvedBy: true,
          approvedAt: true,
          notes: true,
          category: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      purchaseOrders: resolvedPOs.map((po) => ({
        ...po,
        totalAmount: Number(po.totalAmount),
      })),
      expenses: resolvedExpenses.map((exp) => ({
        ...exp,
        amount: Number(exp.amount),
      })),
    };
  }

  @Get('approvals/stats')
  @Permissions(PERMISSIONS.SETTINGS.VIEW)
  async getApprovalStats(@CurrentUser() user: AuthUser) {
    const orgId = user.organizationId;

    const [poCount, expenseCount, thresholds] = await Promise.all([
      this.prisma.purchaseOrder.count({
        where: { organizationId: orgId, status: POStatus.SUBMITTED },
      }),
      this.prisma.expense.count({
        where: { organizationId: orgId, status: ExpenseStatus.PENDING },
      }),
      this.businessRuleService.getAllThresholds(orgId),
    ]);

    return {
      pendingPurchaseOrders: poCount,
      pendingExpenses: expenseCount,
      thresholds,
    };
  }
}
