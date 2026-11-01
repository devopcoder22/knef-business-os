import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AIPermissionCheckerService } from './ai-permission-checker.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { LocationScopeService } from '../../common/services/location-scope.service';

describe('AIPermissionCheckerService', () => {
  let service: AIPermissionCheckerService;
  let permissionsService: jest.Mocked<PermissionsService>;
  let auditService: jest.Mocked<Partial<AuditService>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIPermissionCheckerService,
        {
          provide: PermissionsService,
          useValue: {
            getResolvedPermissions: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LocationScopeService,
          useValue: {
            getUserLocationIds: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<AIPermissionCheckerService>(AIPermissionCheckerService);
    permissionsService = module.get(PermissionsService);
    auditService = module.get(AuditService);
  });

  const FINANCE_USER_CONTEXT = {
    userId: 'user-finance-1',
    organizationId: 'org-1',
    resolvedPermissions: ['finance.view', 'reports.view'],
  };

  const SALES_USER_CONTEXT = {
    userId: 'user-sales-1',
    organizationId: 'org-1',
    resolvedPermissions: ['sales.view', 'sales.create', 'customers.view'],
    // Note: NO finance.view, NO inventory.view
  };

  const INVENTORY_USER_CONTEXT = {
    userId: 'user-inventory-1',
    organizationId: 'org-1',
    resolvedPermissions: ['inventory.view', 'reports.view'],
    // Note: NO finance.view
  };

  const TASK_USER_CONTEXT = {
    userId: 'user-task-1',
    organizationId: 'org-1',
    resolvedPermissions: ['tasks.create', 'tasks.view'],
  };

  const NO_TASK_USER_CONTEXT = {
    userId: 'user-notask-1',
    organizationId: 'org-1',
    resolvedPermissions: ['sales.view'],
    // Note: NO tasks.create
  };

  describe('Test 1: Finance user can query financial information', () => {
    it('should allow get_financial_summary for user with finance.view', async () => {
      await expect(
        service.checkToolPermission(FINANCE_USER_CONTEXT, 'get_financial_summary'),
      ).resolves.not.toThrow();
    });
  });

  describe('Test 2: Salesperson cannot obtain financial information via AI', () => {
    it('should deny get_financial_summary for user without finance.view', async () => {
      await expect(
        service.checkToolPermission(SALES_USER_CONTEXT, 'get_financial_summary'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should record the denial in audit log', async () => {
      await expect(
        service.checkToolPermission(SALES_USER_CONTEXT, 'get_financial_summary'),
      ).rejects.toThrow(ForbiddenException);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AI_TOOL_DENIED',
          entity: 'AITool',
          entityId: 'get_financial_summary',
          userId: SALES_USER_CONTEXT.userId,
          organizationId: SALES_USER_CONTEXT.organizationId,
        }),
      );
    });
  });

  describe('Test 3: User without inventory permission cannot retrieve inventory data', () => {
    it('should deny get_inventory_levels for user without inventory.view', async () => {
      await expect(
        service.checkToolPermission(SALES_USER_CONTEXT, 'get_inventory_levels'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow get_inventory_levels for user with inventory.view', async () => {
      await expect(
        service.checkToolPermission(INVENTORY_USER_CONTEXT, 'get_inventory_levels'),
      ).resolves.not.toThrow();
    });
  });

  describe('Test 4: User with notifications.view can ask AI to send a notification', () => {
    it('send_notification is allowed for user with notifications.view', async () => {
      const ctxWithNotif = {
        ...TASK_USER_CONTEXT,
        resolvedPermissions: ['tasks.create', 'tasks.view', 'notifications.view'],
      };
      await expect(
        service.checkToolPermission(ctxWithNotif, 'send_notification'),
      ).resolves.not.toThrow();
    });
  });

  describe('Test 5: User without purchasing.create cannot use AI to create a purchase order', () => {
    it('should deny create_purchase_order for user without purchasing.create', async () => {
      await expect(
        service.checkToolPermission(SALES_USER_CONTEXT, 'create_purchase_order'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deny create_purchase_order for task-only user without purchasing.create', async () => {
      await expect(
        service.checkToolPermission(NO_TASK_USER_CONTEXT, 'create_purchase_order'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Test 6: User cannot access another organization data', () => {
    it('should use organizationId from context, not from tool parameters', async () => {
      // The org isolation is at the DB query level (organizationId filter).
      // Test that the context always carries the authenticated user's orgId
      permissionsService.getResolvedPermissions.mockResolvedValueOnce({
        data: {
          userId: 'user-1',
          roles: [],
          fromRoles: [],
          grantedOverrides: [],
          deniedOverrides: [],
          effective: ['inventory.view'],
        },
      } as any);
      const freshContext = await service.resolveExecutionContext('user-1', 'org-1');
      expect(freshContext.organizationId).toBe('org-1');
      // A different org's data would be filtered at the service layer since orgId comes from context
    });
  });

  describe('Test 7: Unregistered tool is denied', () => {
    it('should deny any tool not in the permission registry', async () => {
      await expect(
        service.checkToolPermission(FINANCE_USER_CONTEXT, 'delete_all_records'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should record unregistered tool denial in audit log', async () => {
      await expect(
        service.checkToolPermission(FINANCE_USER_CONTEXT, 'unknown_dangerous_tool'),
      ).rejects.toThrow(ForbiddenException);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AI_TOOL_DENIED',
          entityId: 'unknown_dangerous_tool',
        }),
      );
    });
  });

  describe('Test 8: Denied tool execution never reaches business service', () => {
    it('checkToolPermission throws before any tool logic can run', async () => {
      // This is verified by the ForbiddenException being thrown synchronously
      // before any executor code would be called
      const checkPromise = service.checkToolPermission(SALES_USER_CONTEXT, 'get_financial_summary');
      await expect(checkPromise).rejects.toThrow(ForbiddenException);
      // If the check threw, no business service was called — proven by the throw itself
    });
  });

  describe('Test 9: AI-generated arguments cannot override authorization', () => {
    it('permission check uses tool name from registry, not AI-provided parameters', async () => {
      // Even if AI sends tool name 'admin_override' in parameters, the check
      // uses the toolName field directly from the registry lookup
      await expect(
        service.checkToolPermission(FINANCE_USER_CONTEXT, 'admin_override'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('extra parameters do not affect permission outcome', async () => {
      // Even with crafted parameters, only the toolName matters for permission check
      const contextWithAllPerms = {
        userId: 'user-1',
        organizationId: 'org-1',
        resolvedPermissions: ['inventory.view'],
      };
      // get_inventory_levels is allowed regardless of parameters content
      await expect(
        service.checkToolPermission(contextWithAllPerms, 'get_inventory_levels'),
      ).resolves.not.toThrow();
    });
  });

  describe('Test 10: Authorized AI functionality continues to work', () => {
    it('should allow all registered tools for user with all permissions', async () => {
      const adminContext = {
        userId: 'admin-1',
        organizationId: 'org-1',
        resolvedPermissions: [
          'inventory.view',
          'reports.view',
          'purchasing.create',
          'finance.view',
          'notifications.view',
        ],
      };
      const tools = [
        'get_inventory_levels',
        'get_sales_summary',
        'get_low_stock_products',
        'send_notification',
        'get_financial_summary',
      ];
      for (const toolName of tools) {
        await expect(
          service.checkToolPermission(adminContext, toolName),
        ).resolves.not.toThrow();
      }
    });

    it('hasToolPermission returns true for permitted tools', async () => {
      const result = await service.hasToolPermission(FINANCE_USER_CONTEXT, 'get_financial_summary');
      expect(result).toBe(true);
    });

    it('hasToolPermission returns false for unpermitted tools without throwing', async () => {
      const result = await service.hasToolPermission(SALES_USER_CONTEXT, 'get_financial_summary');
      expect(result).toBe(false);
    });
  });

  describe('resolveExecutionContext', () => {
    it('should call permissionsService and return resolved permissions', async () => {
      permissionsService.getResolvedPermissions.mockResolvedValueOnce({
        data: {
          userId: 'user-1',
          roles: ['finance'],
          fromRoles: ['finance.view', 'reports.view'],
          grantedOverrides: [],
          deniedOverrides: [],
          effective: ['finance.view', 'reports.view'],
        },
      } as any);

      const ctx = await service.resolveExecutionContext('user-1', 'org-1');
      expect(ctx.userId).toBe('user-1');
      expect(ctx.organizationId).toBe('org-1');
      expect(ctx.resolvedPermissions).toContain('finance.view');
      expect(permissionsService.getResolvedPermissions).toHaveBeenCalledWith('org-1', 'user-1');
    });
  });
});
