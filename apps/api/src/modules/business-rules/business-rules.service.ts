import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { RULE_DEFAULTS, type RuleId, type RuleResult } from './business-rules.types';

@Injectable()
export class BusinessRuleService {
  constructor(private readonly settings: SettingsService) {}

  async getRuleThreshold(orgId: string, ruleId: RuleId): Promise<number> {
    const raw = await this.settings.getValue(orgId, ruleId);
    const parsed = raw !== null ? parseFloat(raw) : NaN;
    return isNaN(parsed) ? RULE_DEFAULTS[ruleId] : parsed;
  }

  async getAllThresholds(orgId: string): Promise<Record<RuleId, number>> {
    const ids = Object.keys(RULE_DEFAULTS) as RuleId[];
    const entries = await Promise.all(ids.map(async (id) => [id, await this.getRuleThreshold(orgId, id)]));
    return Object.fromEntries(entries) as Record<RuleId, number>;
  }

  async checkDiscount(orgId: string, discountPercent: number): Promise<RuleResult> {
    const ruleId: RuleId = 'rules.sales.max_discount_percent';
    const threshold = await this.getRuleThreshold(orgId, ruleId);
    const approvalRequired = discountPercent > threshold;
    return {
      allowed: true,
      approvalRequired,
      ruleId,
      reason: approvalRequired
        ? `Discount of ${discountPercent.toFixed(2)}% exceeds the configured maximum of ${threshold}%`
        : 'Discount is within the allowed range',
      threshold,
      observedValue: discountPercent,
    };
  }

  async checkMargin(orgId: string, marginPercent: number): Promise<RuleResult> {
    const ruleId: RuleId = 'rules.sales.min_margin_percent';
    const threshold = await this.getRuleThreshold(orgId, ruleId);
    const allowed = marginPercent >= threshold;
    return {
      allowed,
      approvalRequired: !allowed,
      ruleId,
      reason: allowed
        ? 'Margin is above the minimum threshold'
        : `Margin of ${marginPercent.toFixed(2)}% is below the configured minimum of ${threshold}%`,
      threshold,
      observedValue: marginPercent,
    };
  }

  async checkPurchaseAmount(orgId: string, amount: number): Promise<RuleResult> {
    const ruleId: RuleId = 'rules.purchasing.approval_threshold_ngn';
    const threshold = await this.getRuleThreshold(orgId, ruleId);
    const approvalRequired = amount > threshold;
    return {
      allowed: true,
      approvalRequired,
      ruleId,
      reason: approvalRequired
        ? `Purchase of ₦${amount.toLocaleString()} exceeds the approval threshold of ₦${threshold.toLocaleString()}`
        : 'Purchase is within the auto-approve threshold',
      threshold,
      observedValue: amount,
    };
  }

  async checkExpenseAmount(orgId: string, amount: number): Promise<RuleResult> {
    const ruleId: RuleId = 'rules.expense.approval_threshold_ngn';
    const threshold = await this.getRuleThreshold(orgId, ruleId);
    const approvalRequired = amount > threshold;
    return {
      allowed: true,
      approvalRequired,
      ruleId,
      reason: approvalRequired
        ? `Expense of ₦${amount.toLocaleString()} exceeds the approval threshold of ₦${threshold.toLocaleString()}`
        : 'Expense is within the standard limit',
      threshold,
      observedValue: amount,
    };
  }

  async checkRefundAmount(orgId: string, amount: number): Promise<RuleResult> {
    const ruleId: RuleId = 'rules.sales.refund_approval_threshold_ngn';
    const threshold = await this.getRuleThreshold(orgId, ruleId);
    const approvalRequired = amount > threshold;
    return {
      allowed: true,
      approvalRequired,
      ruleId,
      reason: approvalRequired
        ? `Refund of ₦${amount.toLocaleString()} exceeds the approval threshold of ₦${threshold.toLocaleString()}`
        : 'Refund is within the standard limit',
      threshold,
      observedValue: amount,
    };
  }
}
