import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationActionDispatcherService } from './automation-action-dispatcher.service';
import type { AutomationEventEnvelope } from './automation-action-dispatcher.service';

@Injectable()
export class AutomationEventsListener {
  private readonly logger = new Logger(AutomationEventsListener.name);

  constructor(
    private readonly rulesService: AutomationRulesService,
    private readonly dispatcher: AutomationActionDispatcherService,
  ) {}

  // ── Inventory ──────────────────────────────────────────────────────────────

  @OnEvent('inventory.low')
  async onInventoryLow(payload: Record<string, unknown>) {
    await this.handle('inventory.low', payload);
  }

  @OnEvent('inventory.out_of_stock')
  async onInventoryOutOfStock(payload: Record<string, unknown>) {
    await this.handle('inventory.out_of_stock', payload);
  }

  @OnEvent('inventory.updated')
  async onInventoryUpdated(payload: Record<string, unknown>) {
    await this.handle('inventory.updated', payload);
  }

  // ── Sales / Orders ─────────────────────────────────────────────────────────

  @OnEvent('order.created')
  async onOrderCreated(payload: Record<string, unknown>) {
    await this.handle('order.created', payload);
  }

  @OnEvent('order.completed')
  async onOrderCompleted(payload: Record<string, unknown>) {
    await this.handle('order.completed', payload);
  }

  @OnEvent('order.cancelled')
  async onOrderCancelled(payload: Record<string, unknown>) {
    await this.handle('order.cancelled', payload);
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  @OnEvent('payment.received')
  async onPaymentReceived(payload: Record<string, unknown>) {
    await this.handle('payment.received', payload);
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  @OnEvent('invoice.created')
  async onInvoiceCreated(payload: Record<string, unknown>) {
    await this.handle('invoice.created', payload);
  }

  @OnEvent('invoice.paid')
  async onInvoicePaid(payload: Record<string, unknown>) {
    await this.handle('invoice.paid', payload);
  }

  // ── Purchasing ─────────────────────────────────────────────────────────────

  @OnEvent('purchase_order.created')
  async onPurchaseOrderCreated(payload: Record<string, unknown>) {
    await this.handle('purchase_order.created', payload);
  }

  @OnEvent('purchase_order.approved')
  async onPurchaseOrderApproved(payload: Record<string, unknown>) {
    await this.handle('purchase_order.approved', payload);
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  @OnEvent('customer.created')
  async onCustomerCreated(payload: Record<string, unknown>) {
    await this.handle('customer.created', payload);
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  @OnEvent('task.created')
  async onTaskCreated(payload: Record<string, unknown>) {
    await this.handle('task.created', payload);
  }

  @OnEvent('task.completed')
  async onTaskCompleted(payload: Record<string, unknown>) {
    await this.handle('task.completed', payload);
  }

  // ── Goals ──────────────────────────────────────────────────────────────────

  @OnEvent('goal.reached')
  async onGoalReached(payload: Record<string, unknown>) {
    await this.handle('goal.reached', payload);
  }

  // ── Staff ──────────────────────────────────────────────────────────────────

  @OnEvent('staff.clocked_in')
  async onStaffClockedIn(payload: Record<string, unknown>) {
    await this.handle('staff.clocked_in', payload);
  }

  @OnEvent('staff.clocked_out')
  async onStaffClockedOut(payload: Record<string, unknown>) {
    await this.handle('staff.clocked_out', payload);
  }

  // ── Core handler ──────────────────────────────────────────────────────────

  private async handle(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const organizationId = payload['organizationId'] as string | undefined;
    if (!organizationId) {
      this.logger.warn(`Event ${eventType} received without organizationId — skipping`);
      return;
    }

    const locationId = (payload['locationId'] as string | undefined) ?? null;
    const actorUserId = (payload['actorUserId'] as string | undefined) ?? null;
    const entityId = payload['entityId'] as string | undefined;
    const automationDepth = (payload['automationDepth'] as number | undefined) ?? 0;
    const causationId = (payload['causationId'] as string | undefined) ?? null;

    try {
      const rules = await this.rulesService.findMatchingRules(organizationId, eventType, locationId);
      if (rules.length === 0) return;

      const envelope: AutomationEventEnvelope = {
        eventType,
        organizationId,
        locationId,
        actorUserId,
        entityId,
        occurredAt: new Date(),
        automationDepth,
        causationId,
        data: payload,
      };

      await this.dispatcher.dispatchForEvent(rules, envelope);
    } catch (err) {
      this.logger.error(
        `Failed to dispatch automation rules for event ${eventType} (org=${organizationId}): ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
