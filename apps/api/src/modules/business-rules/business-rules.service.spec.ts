import { Test, type TestingModule } from '@nestjs/testing';
import { BusinessRuleService } from './business-rules.service';
import { SettingsService } from '../settings/settings.service';

function makeSettingsService(valueMap: Record<string, string | null> = {}) {
  return {
    getValue: jest.fn().mockImplementation((_orgId: string, key: string) =>
      Promise.resolve(valueMap[key] ?? null),
    ),
  } as unknown as SettingsService;
}

describe('BusinessRuleService', () => {
  const ORG = 'org-test';

  async function build(valueMap: Record<string, string | null> = {}) {
    const settingsService = makeSettingsService(valueMap);
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessRuleService,
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();
    return { svc: mod.get(BusinessRuleService), settingsService };
  }

  // ── Discount checks ──────────────────────────────────────────────────────────

  describe('checkDiscount', () => {
    it('allows discount below threshold', async () => {
      const { svc } = await build({ 'rules.sales.max_discount_percent': '20' });
      const result = await svc.checkDiscount(ORG, 15);
      expect(result.allowed).toBe(true);
      expect(result.approvalRequired).toBe(false);
      expect(result.threshold).toBe(20);
      expect(result.observedValue).toBe(15);
    });

    it('allows discount at exactly the threshold', async () => {
      const { svc } = await build({ 'rules.sales.max_discount_percent': '20' });
      const result = await svc.checkDiscount(ORG, 20);
      expect(result.allowed).toBe(true);
      expect(result.approvalRequired).toBe(false);
    });

    it('flags discount above threshold as approvalRequired', async () => {
      const { svc } = await build({ 'rules.sales.max_discount_percent': '20' });
      const result = await svc.checkDiscount(ORG, 25);
      expect(result.allowed).toBe(true);
      expect(result.approvalRequired).toBe(true);
      expect(result.ruleId).toBe('rules.sales.max_discount_percent');
      expect(result.reason).toMatch(/25/);
    });

    it('uses default threshold (20%) when setting is missing', async () => {
      const { svc } = await build({});
      const result = await svc.checkDiscount(ORG, 21);
      expect(result.approvalRequired).toBe(true);
      expect(result.threshold).toBe(20);
    });

    it('reads threshold at evaluation time, not cached', async () => {
      const settingsService = makeSettingsService({});
      const mod = await Test.createTestingModule({
        providers: [
          BusinessRuleService,
          { provide: SettingsService, useValue: settingsService },
        ],
      }).compile();
      const svc = mod.get(BusinessRuleService);

      // First call: default 20
      (settingsService.getValue as jest.Mock).mockResolvedValueOnce('20');
      const r1 = await svc.checkDiscount(ORG, 21);
      expect(r1.threshold).toBe(20);

      // Second call: threshold now raised to 30
      (settingsService.getValue as jest.Mock).mockResolvedValueOnce('30');
      const r2 = await svc.checkDiscount(ORG, 21);
      expect(r2.threshold).toBe(30);
      expect(r2.approvalRequired).toBe(false);
    });
  });

  // ── Margin checks ────────────────────────────────────────────────────────────

  describe('checkMargin', () => {
    it('allows margin above threshold', async () => {
      const { svc } = await build({ 'rules.sales.min_margin_percent': '10' });
      const result = await svc.checkMargin(ORG, 25);
      expect(result.allowed).toBe(true);
      expect(result.approvalRequired).toBe(false);
    });

    it('allows margin at exactly the threshold', async () => {
      const { svc } = await build({ 'rules.sales.min_margin_percent': '10' });
      const result = await svc.checkMargin(ORG, 10);
      expect(result.allowed).toBe(true);
      expect(result.approvalRequired).toBe(false);
    });

    it('blocks margin below threshold with allowed=false', async () => {
      const { svc } = await build({ 'rules.sales.min_margin_percent': '10' });
      const result = await svc.checkMargin(ORG, 5);
      expect(result.allowed).toBe(false);
      expect(result.approvalRequired).toBe(true);
      expect(result.ruleId).toBe('rules.sales.min_margin_percent');
      expect(result.reason).toMatch(/5/);
      expect(result.threshold).toBe(10);
    });

    it('uses default threshold (10%) when setting is missing', async () => {
      const { svc } = await build({});
      const result = await svc.checkMargin(ORG, 9);
      expect(result.allowed).toBe(false);
      expect(result.threshold).toBe(10);
    });
  });

  // ── Purchase amount checks ───────────────────────────────────────────────────

  describe('checkPurchaseAmount', () => {
    it('does not require approval for amount below threshold', async () => {
      const { svc } = await build({ 'rules.purchasing.approval_threshold_ngn': '500000' });
      const result = await svc.checkPurchaseAmount(ORG, 499_999);
      expect(result.allowed).toBe(true);
      expect(result.approvalRequired).toBe(false);
      expect(result.threshold).toBe(500_000);
    });

    it('requires approval for amount at the threshold', async () => {
      const { svc } = await build({ 'rules.purchasing.approval_threshold_ngn': '500000' });
      const result = await svc.checkPurchaseAmount(ORG, 500_000);
      expect(result.approvalRequired).toBe(false); // at threshold, not above
    });

    it('requires approval for amount above threshold', async () => {
      const { svc } = await build({ 'rules.purchasing.approval_threshold_ngn': '500000' });
      const result = await svc.checkPurchaseAmount(ORG, 500_001);
      expect(result.allowed).toBe(true);
      expect(result.approvalRequired).toBe(true);
      expect(result.ruleId).toBe('rules.purchasing.approval_threshold_ngn');
    });

    it('uses default threshold (₦500,000) when setting is missing', async () => {
      const { svc } = await build({});
      const result = await svc.checkPurchaseAmount(ORG, 600_000);
      expect(result.approvalRequired).toBe(true);
      expect(result.threshold).toBe(500_000);
    });
  });

  // ── Expense amount checks ────────────────────────────────────────────────────

  describe('checkExpenseAmount', () => {
    it('does not require approval for amount below threshold', async () => {
      const { svc } = await build({ 'rules.expense.approval_threshold_ngn': '100000' });
      const result = await svc.checkExpenseAmount(ORG, 50_000);
      expect(result.approvalRequired).toBe(false);
      expect(result.threshold).toBe(100_000);
    });

    it('requires approval for amount above threshold', async () => {
      const { svc } = await build({ 'rules.expense.approval_threshold_ngn': '100000' });
      const result = await svc.checkExpenseAmount(ORG, 150_000);
      expect(result.approvalRequired).toBe(true);
      expect(result.allowed).toBe(true);
    });

    it('uses default threshold (₦100,000) when setting is missing', async () => {
      const { svc } = await build({});
      const result = await svc.checkExpenseAmount(ORG, 100_001);
      expect(result.approvalRequired).toBe(true);
      expect(result.threshold).toBe(100_000);
    });
  });

  // ── Refund amount checks ─────────────────────────────────────────────────────

  describe('checkRefundAmount', () => {
    it('does not require approval for amount below threshold', async () => {
      const { svc } = await build({ 'rules.sales.refund_approval_threshold_ngn': '50000' });
      const result = await svc.checkRefundAmount(ORG, 30_000);
      expect(result.approvalRequired).toBe(false);
      expect(result.threshold).toBe(50_000);
    });

    it('requires approval for amount above threshold', async () => {
      const { svc } = await build({ 'rules.sales.refund_approval_threshold_ngn': '50000' });
      const result = await svc.checkRefundAmount(ORG, 60_000);
      expect(result.approvalRequired).toBe(true);
      expect(result.ruleId).toBe('rules.sales.refund_approval_threshold_ngn');
    });
  });

  // ── Threshold utilities ──────────────────────────────────────────────────────

  describe('getAllThresholds', () => {
    it('returns all thresholds at once', async () => {
      const { svc } = await build({
        'rules.sales.max_discount_percent': '15',
        'rules.sales.min_margin_percent': '12',
        'rules.purchasing.approval_threshold_ngn': '750000',
        'rules.expense.approval_threshold_ngn': '200000',
        'rules.sales.refund_approval_threshold_ngn': '75000',
      });
      const thresholds = await svc.getAllThresholds(ORG);
      expect(thresholds['rules.sales.max_discount_percent']).toBe(15);
      expect(thresholds['rules.sales.min_margin_percent']).toBe(12);
      expect(thresholds['rules.purchasing.approval_threshold_ngn']).toBe(750_000);
      expect(thresholds['rules.expense.approval_threshold_ngn']).toBe(200_000);
      expect(thresholds['rules.sales.refund_approval_threshold_ngn']).toBe(75_000);
    });

    it('falls back to defaults for missing settings', async () => {
      const { svc } = await build({});
      const thresholds = await svc.getAllThresholds(ORG);
      expect(thresholds['rules.sales.max_discount_percent']).toBe(20);
      expect(thresholds['rules.sales.min_margin_percent']).toBe(10);
      expect(thresholds['rules.purchasing.approval_threshold_ngn']).toBe(500_000);
      expect(thresholds['rules.expense.approval_threshold_ngn']).toBe(100_000);
      expect(thresholds['rules.sales.refund_approval_threshold_ngn']).toBe(50_000);
    });
  });

  // ── Rule result structure ────────────────────────────────────────────────────

  describe('rule result structure', () => {
    it('always includes all required fields', async () => {
      const { svc } = await build({});
      const result = await svc.checkPurchaseAmount(ORG, 1000);
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('approvalRequired');
      expect(result).toHaveProperty('ruleId');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('threshold');
      expect(result).toHaveProperty('observedValue');
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });
});
