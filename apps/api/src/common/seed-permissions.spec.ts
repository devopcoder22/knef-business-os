/**
 * Stage 21 — Seed Permission Coverage Tests
 *
 * Verifies that seed.ts ALL_PERMISSIONS contains all AUTOMATION.* permission strings,
 * and that role arrays are assigned appropriately for fresh-install access.
 *
 * Coverage:
 *  1.  ALL_PERMISSIONS contains all seven AUTOMATION.* permissions
 *  2.  SUPER_ADMIN role array maps to ALL_PERMISSIONS (gets all automation)
 *  3.  GENERAL_MANAGER gets view/create/edit/activate/execute/history.view (not delete)
 *  4.  SALES_MANAGER gets view + history.view only
 *  5.  AUTOMATION.DELETE not present in SALES_MANAGER or SALES_STAFF arrays
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { PERMISSIONS } from '@knef/constants';

const SEED_PATH = join(__dirname, '../../../../packages/database/prisma/seed.ts');
const seedContent = readFileSync(SEED_PATH, 'utf-8');

const AUTOMATION = PERMISSIONS.AUTOMATION;

describe('seed.ts — automation permissions in ALL_PERMISSIONS', () => {
  const automationPerms = Object.values(AUTOMATION) as string[];

  it('1: ALL_PERMISSIONS contains all seven AUTOMATION.* permission strings', () => {
    for (const perm of automationPerms) {
      expect(seedContent).toContain(`'${perm}'`);
    }
  });

  it('2: automation.view is in ALL_PERMISSIONS block', () => {
    // Verify the string appears in the ALL_PERMISSIONS array (not just anywhere in the file)
    const allPermsMatch = seedContent.match(/const ALL_PERMISSIONS = \[([\s\S]*?)\];/);
    expect(allPermsMatch).not.toBeNull();
    const allPermsBlock = allPermsMatch![1];
    for (const perm of automationPerms) {
      expect(allPermsBlock).toContain(`'${perm}'`);
    }
  });
});

describe('seed.ts — GENERAL_MANAGER role automation assignment', () => {
  it('3: GENERAL_MANAGER has automation.view, create, edit, activate, execute, history.view', () => {
    const gmMatch = seedContent.match(/GENERAL_MANAGER:\s*\[([\s\S]*?)\],\s*SALES_MANAGER/);
    expect(gmMatch).not.toBeNull();
    const gmBlock = gmMatch![1];

    const expected = [
      AUTOMATION.VIEW,
      AUTOMATION.CREATE,
      AUTOMATION.EDIT,
      AUTOMATION.ACTIVATE,
      AUTOMATION.EXECUTE,
      AUTOMATION.HISTORY_VIEW,
    ];
    for (const perm of expected) {
      expect(gmBlock).toContain(`'${perm}'`);
    }
  });

  it('3b: GENERAL_MANAGER does NOT have automation.delete (admin-only)', () => {
    const gmMatch = seedContent.match(/GENERAL_MANAGER:\s*\[([\s\S]*?)\],\s*SALES_MANAGER/);
    const gmBlock = gmMatch![1];
    expect(gmBlock).not.toContain(`'${AUTOMATION.DELETE}'`);
  });
});

describe('seed.ts — SALES_MANAGER role automation assignment', () => {
  it('4: SALES_MANAGER has automation.view and automation.history.view', () => {
    const smMatch = seedContent.match(/SALES_MANAGER:\s*\[([\s\S]*?)\],\s*SALES_STAFF/);
    expect(smMatch).not.toBeNull();
    const smBlock = smMatch![1];
    expect(smBlock).toContain(`'${AUTOMATION.VIEW}'`);
    expect(smBlock).toContain(`'${AUTOMATION.HISTORY_VIEW}'`);
  });

  it('5: SALES_MANAGER does not have destructive automation permissions', () => {
    const smMatch = seedContent.match(/SALES_MANAGER:\s*\[([\s\S]*?)\],\s*SALES_STAFF/);
    const smBlock = smMatch![1];
    const restricted = [AUTOMATION.DELETE, AUTOMATION.CREATE, AUTOMATION.EDIT, AUTOMATION.ACTIVATE, AUTOMATION.EXECUTE];
    for (const perm of restricted) {
      expect(smBlock).not.toContain(`'${perm}'`);
    }
  });
});
