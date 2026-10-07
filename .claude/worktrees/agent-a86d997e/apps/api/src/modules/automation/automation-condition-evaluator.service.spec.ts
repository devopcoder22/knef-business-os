import { AutomationConditionEvaluatorService } from './automation-condition-evaluator.service';
import type { ConditionNode, EvaluationContext } from './automation-condition-evaluator.service';

function makeSvc() {
  return new AutomationConditionEvaluatorService();
}

function ctx(data: Record<string, unknown> = {}): EvaluationContext {
  return { data, ...data };
}

describe('AutomationConditionEvaluatorService', () => {
  // ── Empty conditions ─────────────────────────────────────────────────────

  it('empty conditions array returns true (pass-through)', () => {
    expect(makeSvc().evaluate([], ctx())).toBe(true);
  });

  // ── equals / notEquals ───────────────────────────────────────────────────

  it('equals: matches same string', () => {
    const conditions: ConditionNode[] = [{ field: 'data.status', operator: 'equals', value: 'ACTIVE' }];
    expect(makeSvc().evaluate(conditions, ctx({ status: 'ACTIVE' }))).toBe(true);
  });

  it('equals: rejects different string', () => {
    const conditions: ConditionNode[] = [{ field: 'data.status', operator: 'equals', value: 'ACTIVE' }];
    expect(makeSvc().evaluate(conditions, ctx({ status: 'INACTIVE' }))).toBe(false);
  });

  it('equals: does not coerce number string to boolean', () => {
    const conditions: ConditionNode[] = [{ field: 'data.value', operator: 'equals', value: true }];
    expect(makeSvc().evaluate(conditions, ctx({ value: 'true' }))).toBe(false);
  });

  it('notEquals: passes when values differ', () => {
    const conditions: ConditionNode[] = [{ field: 'data.x', operator: 'notEquals', value: 'foo' }];
    expect(makeSvc().evaluate(conditions, ctx({ x: 'bar' }))).toBe(true);
  });

  // ── greaterThan / greaterThanOrEqual ─────────────────────────────────────

  it('greaterThan: number > threshold', () => {
    const cond: ConditionNode[] = [{ field: 'data.qty', operator: 'greaterThan', value: 5 }];
    expect(makeSvc().evaluate(cond, ctx({ qty: 10 }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ qty: 5 }))).toBe(false);
  });

  it('greaterThanOrEqual: number >= threshold', () => {
    const cond: ConditionNode[] = [{ field: 'data.qty', operator: 'greaterThanOrEqual', value: 5 }];
    expect(makeSvc().evaluate(cond, ctx({ qty: 5 }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ qty: 4 }))).toBe(false);
  });

  // ── lessThan / lessThanOrEqual ────────────────────────────────────────────

  it('lessThan: number < threshold', () => {
    const cond: ConditionNode[] = [{ field: 'data.qty', operator: 'lessThan', value: 10 }];
    expect(makeSvc().evaluate(cond, ctx({ qty: 3 }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ qty: 10 }))).toBe(false);
  });

  it('lessThanOrEqual: number <= threshold', () => {
    const cond: ConditionNode[] = [{ field: 'data.qty', operator: 'lessThanOrEqual', value: 10 }];
    expect(makeSvc().evaluate(cond, ctx({ qty: 10 }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ qty: 11 }))).toBe(false);
  });

  // ── NaN safety ────────────────────────────────────────────────────────────

  it('greaterThan: non-numeric string returns false (no coercion)', () => {
    const cond: ConditionNode[] = [{ field: 'data.qty', operator: 'greaterThan', value: 5 }];
    expect(makeSvc().evaluate(cond, ctx({ qty: 'much' }))).toBe(false);
  });

  // ── contains / notContains ────────────────────────────────────────────────

  it('contains: substring match (case-insensitive)', () => {
    const cond: ConditionNode[] = [{ field: 'data.name', operator: 'contains', value: 'rice' }];
    expect(makeSvc().evaluate(cond, ctx({ name: 'Basmati Rice Bag' }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ name: 'Wheat' }))).toBe(false);
  });

  it('contains: array includes element', () => {
    const cond: ConditionNode[] = [{ field: 'data.tags', operator: 'contains', value: 'urgent' }];
    expect(makeSvc().evaluate(cond, ctx({ tags: ['urgent', 'sale'] }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ tags: ['normal'] }))).toBe(false);
  });

  it('notContains: passes when string absent', () => {
    const cond: ConditionNode[] = [{ field: 'data.name', operator: 'notContains', value: 'test' }];
    expect(makeSvc().evaluate(cond, ctx({ name: 'Production' }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ name: 'test-item' }))).toBe(false);
  });

  // ── in / notIn ────────────────────────────────────────────────────────────

  it('in: value is member of list', () => {
    const cond: ConditionNode[] = [{ field: 'data.status', operator: 'in', value: ['ACTIVE', 'PENDING'] }];
    expect(makeSvc().evaluate(cond, ctx({ status: 'ACTIVE' }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ status: 'CLOSED' }))).toBe(false);
  });

  it('in: returns false when right side is not array', () => {
    const cond: ConditionNode[] = [{ field: 'data.status', operator: 'in', value: 'ACTIVE' }];
    expect(makeSvc().evaluate(cond, ctx({ status: 'ACTIVE' }))).toBe(false);
  });

  it('notIn: value is absent from list', () => {
    const cond: ConditionNode[] = [{ field: 'data.status', operator: 'notIn', value: ['BANNED', 'CLOSED'] }];
    expect(makeSvc().evaluate(cond, ctx({ status: 'ACTIVE' }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ status: 'BANNED' }))).toBe(false);
  });

  // ── exists / notExists ────────────────────────────────────────────────────

  it('exists: true when field is present and non-null', () => {
    const cond: ConditionNode[] = [{ field: 'data.customerId', operator: 'exists' }];
    expect(makeSvc().evaluate(cond, ctx({ customerId: 'c1' }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ customerId: null }))).toBe(false);
    expect(makeSvc().evaluate(cond, ctx({}))).toBe(false);
  });

  it('notExists: true when field is absent or null', () => {
    const cond: ConditionNode[] = [{ field: 'data.referrer', operator: 'notExists' }];
    expect(makeSvc().evaluate(cond, ctx({}))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ referrer: null }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ referrer: 'google' }))).toBe(false);
  });

  // ── AND / OR groups ───────────────────────────────────────────────────────

  it('AND group: all must pass', () => {
    const cond: ConditionNode[] = [{
      logic: 'AND',
      conditions: [
        { field: 'data.qty', operator: 'lessThan', value: 10 },
        { field: 'data.status', operator: 'equals', value: 'ACTIVE' },
      ],
    }];
    expect(makeSvc().evaluate(cond, ctx({ qty: 5, status: 'ACTIVE' }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ qty: 15, status: 'ACTIVE' }))).toBe(false);
  });

  it('OR group: at least one must pass', () => {
    const cond: ConditionNode[] = [{
      logic: 'OR',
      conditions: [
        { field: 'data.qty', operator: 'lessThan', value: 5 },
        { field: 'data.status', operator: 'equals', value: 'CRITICAL' },
      ],
    }];
    expect(makeSvc().evaluate(cond, ctx({ qty: 20, status: 'CRITICAL' }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ qty: 20, status: 'NORMAL' }))).toBe(false);
  });

  // ── Dot-notation path resolution ──────────────────────────────────────────

  it('resolves nested dot-notation path', () => {
    const cond: ConditionNode[] = [{ field: 'data.order.totalAmount', operator: 'greaterThan', value: 1000 }];
    expect(makeSvc().evaluate(cond, ctx({ order: { totalAmount: 2000 } }))).toBe(true);
    expect(makeSvc().evaluate(cond, ctx({ order: { totalAmount: 500 } }))).toBe(false);
  });

  it('missing nested path returns false for most operators', () => {
    const cond: ConditionNode[] = [{ field: 'data.order.nonExistent', operator: 'equals', value: 'x' }];
    expect(makeSvc().evaluate(cond, ctx({ order: {} }))).toBe(false);
  });

  // ── Invalid conditions ────────────────────────────────────────────────────

  it('invalid operator fails safely (returns false)', () => {
    const cond = [{ field: 'data.x', operator: 'HACK' as never }] as ConditionNode[];
    expect(makeSvc().evaluate(cond, ctx({ x: 'y' }))).toBe(false);
  });

  it('missing field fails safely (returns false)', () => {
    const cond = [{ field: '', operator: 'equals', value: 'x' }] as ConditionNode[];
    expect(makeSvc().evaluate(cond, ctx({ x: 'x' }))).toBe(false);
  });

  // ── validateConditions ────────────────────────────────────────────────────

  it('validateConditions: accepts valid leaf', () => {
    const errors = makeSvc().validateConditions([
      { field: 'data.qty', operator: 'lessThan', value: 10 },
    ]);
    expect(errors).toHaveLength(0);
  });

  it('validateConditions: rejects unknown operator', () => {
    const errors = makeSvc().validateConditions([
      { field: 'data.qty', operator: 'EVIL' as never },
    ]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/operator/);
  });

  it('validateConditions: rejects empty field', () => {
    const errors = makeSvc().validateConditions([
      { field: '', operator: 'equals', value: 'x' },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validateConditions: validates nested group', () => {
    const errors = makeSvc().validateConditions([{
      logic: 'AND',
      conditions: [{ field: 'data.x', operator: 'equals', value: '1' }],
    }]);
    expect(errors).toHaveLength(0);
  });

  it('validateConditions: rejects invalid group logic', () => {
    const errors = makeSvc().validateConditions([{
      logic: 'INVALID' as never,
      conditions: [],
    }]);
    expect(errors.length).toBeGreaterThan(0);
  });
});
