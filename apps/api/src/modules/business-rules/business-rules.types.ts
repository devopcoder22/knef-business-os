export type RuleId =
  | 'rules.sales.max_discount_percent'
  | 'rules.sales.min_margin_percent'
  | 'rules.sales.refund_approval_threshold_ngn'
  | 'rules.purchasing.approval_threshold_ngn'
  | 'rules.expense.approval_threshold_ngn';

export interface RuleResult {
  allowed: boolean;
  approvalRequired: boolean;
  ruleId: RuleId;
  reason: string;
  threshold: number;
  observedValue: number;
}

export const RULE_DEFAULTS: Record<RuleId, number> = {
  'rules.sales.max_discount_percent': 20,
  'rules.sales.min_margin_percent': 10,
  'rules.sales.refund_approval_threshold_ngn': 50_000,
  'rules.purchasing.approval_threshold_ngn': 500_000,
  'rules.expense.approval_threshold_ngn': 100_000,
};
