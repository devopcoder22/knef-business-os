import { Injectable } from '@nestjs/common';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'contains'
  | 'notContains'
  | 'in'
  | 'notIn'
  | 'exists'
  | 'notExists';

export const VALID_OPERATORS = new Set<ConditionOperator>([
  'equals', 'notEquals',
  'greaterThan', 'greaterThanOrEqual',
  'lessThan', 'lessThanOrEqual',
  'contains', 'notContains',
  'in', 'notIn',
  'exists', 'notExists',
]);

export interface LeafCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface GroupCondition {
  logic: 'AND' | 'OR';
  conditions: (LeafCondition | GroupCondition)[];
}

export type ConditionNode = LeafCondition | GroupCondition;

export interface EvaluationContext {
  [key: string]: unknown;
  data: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGroupCondition(node: ConditionNode): node is GroupCondition {
  return 'logic' in node && 'conditions' in node;
}

/** Traverse dot-notation path on a context object (no eval). */
function resolvePath(ctx: EvaluationContext, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = ctx;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Compare two values with explicit type safety. */
function compareValues(left: unknown, right: unknown, operator: ConditionOperator): boolean {
  switch (operator) {
    case 'exists':
      return left !== undefined && left !== null;

    case 'notExists':
      return left === undefined || left === null;

    case 'equals':
      // Strict equality; no coercion across boolean/number/string
      return left === right;

    case 'notEquals':
      return left !== right;

    case 'contains':
      if (typeof left === 'string' && typeof right === 'string') {
        return left.toLowerCase().includes(right.toLowerCase());
      }
      if (Array.isArray(left)) {
        return left.includes(right);
      }
      return false;

    case 'notContains':
      if (typeof left === 'string' && typeof right === 'string') {
        return !left.toLowerCase().includes(right.toLowerCase());
      }
      if (Array.isArray(left)) {
        return !left.includes(right);
      }
      return true;

    case 'in':
      if (!Array.isArray(right)) return false;
      return right.includes(left);

    case 'notIn':
      if (!Array.isArray(right)) return true;
      return !right.includes(left);

    case 'greaterThan':
    case 'greaterThanOrEqual':
    case 'lessThan':
    case 'lessThanOrEqual': {
      // Only compare when both sides are numeric or both are string/date
      const leftN = typeof left === 'number' ? left
        : typeof left === 'string' ? parseFloat(left)
        : left instanceof Date ? left.getTime()
        : NaN;
      const rightN = typeof right === 'number' ? right
        : typeof right === 'string' ? parseFloat(right)
        : right instanceof Date ? right.getTime()
        : NaN;

      if (isNaN(leftN) || isNaN(rightN)) return false;

      if (operator === 'greaterThan') return leftN > rightN;
      if (operator === 'greaterThanOrEqual') return leftN >= rightN;
      if (operator === 'lessThan') return leftN < rightN;
      return leftN <= rightN;
    }

    default:
      return false;
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AutomationConditionEvaluatorService {
  /**
   * Evaluate a condition tree against the supplied context.
   * Never executes arbitrary code — all operators are enumerated.
   */
  evaluate(conditions: ConditionNode[], context: EvaluationContext): boolean {
    if (conditions.length === 0) return true;

    // Top-level array is treated as implicit AND
    for (const node of conditions) {
      if (!this.evaluateNode(node, context)) return false;
    }
    return true;
  }

  private evaluateNode(node: ConditionNode, context: EvaluationContext): boolean {
    if (isGroupCondition(node)) {
      return this.evaluateGroup(node, context);
    }
    return this.evaluateLeaf(node, context);
  }

  private evaluateGroup(group: GroupCondition, context: EvaluationContext): boolean {
    if (!group.conditions || group.conditions.length === 0) return true;

    if (group.logic === 'OR') {
      return group.conditions.some((c) => this.evaluateNode(c, context));
    }
    // AND (default)
    return group.conditions.every((c) => this.evaluateNode(c, context));
  }

  private evaluateLeaf(leaf: LeafCondition, context: EvaluationContext): boolean {
    if (!leaf.field || !VALID_OPERATORS.has(leaf.operator)) {
      // Invalid condition — fail safely (do not execute action)
      return false;
    }

    const leftValue = resolvePath(context, leaf.field);
    return compareValues(leftValue, leaf.value, leaf.operator);
  }

  /**
   * Validate a condition array without executing — returns error strings.
   */
  validateConditions(conditions: unknown[]): string[] {
    const errors: string[] = [];
    this.validateNodes(conditions, errors, 'conditions');
    return errors;
  }

  private validateNodes(nodes: unknown[], errors: string[], path: string): void {
    for (let i = 0; i < nodes.length; i++) {
      this.validateNode(nodes[i], errors, `${path}[${i}]`);
    }
  }

  private validateNode(node: unknown, errors: string[], path: string): void {
    if (!node || typeof node !== 'object') {
      errors.push(`${path}: must be an object`);
      return;
    }
    const n = node as Record<string, unknown>;

    if ('logic' in n) {
      // GroupCondition
      if (n.logic !== 'AND' && n.logic !== 'OR') {
        errors.push(`${path}.logic: must be 'AND' or 'OR'`);
      }
      if (!Array.isArray(n.conditions)) {
        errors.push(`${path}.conditions: must be an array`);
      } else {
        this.validateNodes(n.conditions as unknown[], errors, `${path}.conditions`);
      }
    } else {
      // LeafCondition
      if (typeof n.field !== 'string' || !n.field) {
        errors.push(`${path}.field: must be a non-empty string`);
      }
      if (!VALID_OPERATORS.has(n.operator as ConditionOperator)) {
        errors.push(`${path}.operator: '${String(n.operator)}' is not a valid operator`);
      }
    }
  }
}
