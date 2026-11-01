import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { QueueService } from '../../common/services/queue.service';
import type { ResetCategory } from './dto/reset-data.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async getOverviewStats(organizationId: string) {
    const [
      userCount,
      activeUserCount,
      roleCount,
      agentCount,
      pendingApprovals,
      apiKeyCount,
      featureFlagCount,
    ] = await Promise.all([
      this.prisma.user.count({ where: { organizationId } }),
      this.prisma.user.count({ where: { organizationId, isActive: true } }),
      this.prisma.role.count({ where: { organizationId } }),
      this.prisma.externalAgent.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.aIAction.count({ where: { organizationId, status: 'PENDING' } }),
      this.prisma.aPIKey.count({ where: { organizationId, isActive: true } }),
      this.prisma.featureFlag.count({ where: { organizationId, isEnabled: true } }),
    ]);

    return {
      users: { total: userCount, active: activeUserCount },
      roles: roleCount,
      agents: agentCount,
      pendingApprovals,
      apiKeys: apiKeyCount,
      activeFeatureFlags: featureFlagCount,
    };
  }

  async getSecurityEvents(organizationId: string, limit = 50) {
    const events = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        action: {
          in: [
            'LOGIN_FAILED',
            'LOGIN',
            'LOGOUT',
            'PERMISSION_DENIED',
            'SUSPICIOUS_ACTIVITY',
            'API_KEY_REVOKED',
            'API_KEY_ROTATED',
            'AGENT_SUSPENDED',
            'AGENT_REVOKED',
            'PERMISSION_OVERRIDE_SET',
            'PERMISSION_OVERRIDE_REMOVED',
            'USER_DEACTIVATED',
            'AUTH_DENIED',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return events;
  }

  async listApiKeys(organizationId: string) {
    return this.prisma.aPIKey.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        createdBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeApiKey(organizationId: string, keyId: string) {
    const key = await this.prisma.aPIKey.findFirst({
      where: { id: keyId, organizationId },
    });
    if (!key) throw new Error('NOT_FOUND');

    return this.prisma.aPIKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });
  }

  async getWorkerHealth() {
    const [queueStats, scheduledAgents] = await Promise.all([
      this.queue.getAllQueueStats(),
      this.prisma.aIScheduledAgent.count({ where: { isActive: true } }),
    ]);

    return {
      queues: queueStats,
      scheduledAgents,
    };
  }

  async resetData(
    organizationId: string,
    categories: ResetCategory[],
    requestingUserId: string,
  ): Promise<{ success: true; deleted: Record<string, number> }> {
    try {
      const deleted: Record<string, number> = {};

      let staffUserIds: string[] = [];
      let staffEmployeeIds: string[] = [];
      if (categories.includes('staff')) {
        const usersToDelete = await this.prisma.user.findMany({
          where: {
            organizationId,
            id: { not: requestingUserId },
            roles: { none: { role: { name: { contains: 'SUPER' } } } },
          },
          select: { id: true },
        });
        staffUserIds = usersToDelete.map((u) => u.id);

        if (staffUserIds.length > 0) {
          const employeesToDelete = await this.prisma.employee.findMany({
            where: { userId: { in: staffUserIds } },
            select: { id: true },
          });
          staffEmployeeIds = employeesToDelete.map((e) => e.id);
        }
      }

      await this.prisma.$transaction(
        async (tx) => {
          if (categories.includes('products')) {
            await tx.inventoryLevel.deleteMany({ where: { product: { organizationId } } });
            await tx.inventoryMovement.deleteMany({ where: { organizationId } });
            await tx.serializedUnit.deleteMany({ where: { organizationId } });
            await tx.stockTransferItem.deleteMany({ where: { transfer: { organizationId } } });
            await tx.stockAdjustmentItem.deleteMany({ where: { adjustment: { organizationId } } });
            await tx.stockCountItem.deleteMany({ where: { stockCount: { organizationId } } });
            await tx.goodsReceiptItem.deleteMany({ where: { goodsReceipt: { organizationId } } });
            await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { organizationId } } });
            await tx.salesOrderItem.deleteMany({ where: { order: { organizationId } } });
            await tx.supplierPrice.deleteMany({ where: { supplier: { organizationId } } });
            await tx.productImage.deleteMany({ where: { product: { organizationId } } });
            await tx.productVariant.deleteMany({ where: { product: { organizationId } } });
            const { count: productCount } = await tx.product.deleteMany({ where: { organizationId } });
            const { count: categoryCount } = await tx.category.deleteMany({ where: { organizationId } });
            const { count: brandCount } = await tx.brand.deleteMany({ where: { organizationId } });
            deleted['products'] = productCount + categoryCount + brandCount;
          }

          if (categories.includes('inventory')) {
            await tx.stockTransferItem.deleteMany({ where: { transfer: { organizationId } } });
            const { count: transferCount } = await tx.stockTransfer.deleteMany({ where: { organizationId } });
            await tx.stockAdjustmentItem.deleteMany({ where: { adjustment: { organizationId } } });
            const { count: adjustmentCount } = await tx.stockAdjustment.deleteMany({ where: { organizationId } });
            await tx.stockCountItem.deleteMany({ where: { stockCount: { organizationId } } });
            const { count: countCount } = await tx.stockCount.deleteMany({ where: { organizationId } });
            deleted['inventory'] = transferCount + adjustmentCount + countCount;
          }

          if (categories.includes('purchasing')) {
            await tx.purchaseReturnItem.deleteMany({ where: { purchaseReturn: { organizationId } } });
            const { count: returnCount } = await tx.purchaseReturn.deleteMany({ where: { organizationId } });
            await tx.goodsReceiptItem.deleteMany({ where: { goodsReceipt: { organizationId } } });
            const { count: receiptCount } = await tx.goodsReceipt.deleteMany({ where: { organizationId } });
            await tx.supplierPayment.deleteMany({ where: { supplier: { organizationId } } });
            await tx.supplierInvoice.deleteMany({ where: { supplier: { organizationId } } });
            await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { organizationId } } });
            const { count: poCount } = await tx.purchaseOrder.deleteMany({ where: { organizationId } });
            await tx.supplierPrice.deleteMany({ where: { supplier: { organizationId } } });
            await tx.supplierContact.deleteMany({ where: { supplier: { organizationId } } });
            const { count: supplierCount } = await tx.supplier.deleteMany({ where: { organizationId } });
            deleted['purchasing'] = returnCount + receiptCount + poCount + supplierCount;
          }

          if (categories.includes('orders')) {
            await tx.salesOrderItem.deleteMany({ where: { order: { organizationId } } });
            await tx.invoiceItem.deleteMany({ where: { invoice: { organizationId } } });
            const { count: invoiceCount } = await tx.invoice.deleteMany({ where: { organizationId } });
            const { count: receiptCount } = await tx.receipt.deleteMany({ where: { organizationId } });
            const { count: paymentCount } = await tx.payment.deleteMany({ where: { organizationId } });
            const { count: orderCount } = await tx.salesOrder.deleteMany({ where: { organizationId } });
            deleted['orders'] = orderCount + invoiceCount + receiptCount + paymentCount;
          }

          if (categories.includes('finance')) {
            await tx.invoiceItem.deleteMany({ where: { invoice: { organizationId } } });
            await tx.invoice.deleteMany({ where: { organizationId } });
            await tx.receipt.deleteMany({ where: { organizationId } });
            await tx.payment.deleteMany({ where: { organizationId } });
            const { count: expenseCount } = await tx.expense.deleteMany({ where: { organizationId } });
            const { count: expCatCount } = await tx.expenseCategory.deleteMany({ where: { organizationId } });
            await tx.bankTransaction.deleteMany({ where: { bankAccount: { organizationId } } });
            const { count: bankCount } = await tx.bankAccount.deleteMany({ where: { organizationId } });
            deleted['finance'] = expenseCount + expCatCount + bankCount;
          }

          if (categories.includes('customers')) {
            await tx.customerSegmentMember.deleteMany({ where: { customer: { organizationId } } });
            const { count: customerCount } = await tx.customer.deleteMany({ where: { organizationId } });
            const { count: segmentCount } = await tx.customerSegment.deleteMany({ where: { organizationId } });
            deleted['customers'] = customerCount + segmentCount;
          }

          if (categories.includes('staff') && staffUserIds.length > 0) {
            await tx.salesOrder.updateMany({
              where: { organizationId, userId: { in: staffUserIds } },
              data: { userId: requestingUserId },
            });
            await tx.attendance.deleteMany({ where: { employee: { userId: { in: staffUserIds } } } });
            await tx.staffDuty.deleteMany({ where: { employee: { userId: { in: staffUserIds } } } });
            if (staffEmployeeIds.length > 0) {
              await tx.commission.deleteMany({
                where: { organizationId, employeeId: { in: staffEmployeeIds } },
              });
            }
            await tx.employee.deleteMany({ where: { userId: { in: staffUserIds } } });
            await tx.userRole.deleteMany({ where: { userId: { in: staffUserIds } } });
            await tx.userPermissionOverride.deleteMany({ where: { userId: { in: staffUserIds } } });
            await tx.refreshToken.deleteMany({ where: { userId: { in: staffUserIds } } });
            const { count: userCount } = await tx.user.deleteMany({ where: { id: { in: staffUserIds } } });
            deleted['staff'] = userCount;
          } else if (categories.includes('staff')) {
            deleted['staff'] = 0;
          }

          if (categories.includes('tasks')) {
            // TaskComment, TaskChecklist, TaskAttachment cascade from Task deletion
            const { count: taskCount } = await tx.task.deleteMany({ where: { organizationId } });
            deleted['tasks'] = taskCount;
          }

          if (categories.includes('planner')) {
            // PlanStep and PlanTaskLink cascade from Plan deletion
            const { count: templateCount } = await tx.planTemplate.deleteMany({ where: { organizationId } });
            const { count: planCount } = await tx.plan.deleteMany({ where: { organizationId } });
            deleted['planner'] = planCount + templateCount;
          }

          if (categories.includes('calendar')) {
            // CalendarEvent cascades from CalendarIntegration deletion
            const { count: integrationCount } = await tx.calendarIntegration.deleteMany({ where: { organizationId } });
            deleted['calendar'] = integrationCount;
          }
        },
        { timeout: 60000 },
      );

      return { success: true, deleted };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Data reset failed: ${message}`);
    }
  }
}
