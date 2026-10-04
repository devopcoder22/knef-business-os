import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@knef/types';
import { PrismaService } from '../../common/services/prisma.service';
import { LocationScopeService } from '../../common/services/location-scope.service';
import { GlobalSearchDto } from './dto/global-search.dto';
import { GlobalSearchResponseDto, SearchResultDto } from './dto/search-result.dto';
import {
  SEARCH_ENTITY_REGISTRY,
  SEARCH_ENTITY_TYPES,
  SearchEntityType,
  isSearchEntityType,
} from './search-entity.registry';

/**
 * Global cross-entity search.
 *
 * Rules enforced here:
 * 1. Organization isolation — organizationId is derived from AuthUser; never trusted from input.
 * 2. Per-entity permission — the registry declares the required permission; entities the
 *    user cannot view are silently excluded (no hint they exist).
 * 3. Location scope — for location-aware entities, fresh scope is retrieved from
 *    LocationScopeService.  null = org-wide, [] = deny-all (returns no rows),
 *    [...ids] = filter by `locationId in ids`.
 * 4. Sensitive-field minimisation — salaries, bank/account data, emergency contacts, and
 *    gateway payloads are never selected.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationScopeService: LocationScopeService,
  ) {}

  async globalSearch(user: AuthUser, dto: GlobalSearchDto): Promise<GlobalSearchResponseDto> {
    const q = (dto.q ?? '').trim();
    const limit = dto.limit ?? 5;

    // Defensive early exit — the DTO already enforces length, but service callers
    // (tests, programmatic access) may bypass the validation pipe.
    if (q.length < 2 || q.length > 100) {
      return this.emptyResponse(q);
    }

    const requested = this.parseTypes(dto.types);
    const permitted = this.filterByPermissions(user, requested);

    if (permitted.length === 0) {
      return this.emptyResponse(q);
    }

    // Fresh location scope — the JWT may be stale.
    const needsLocation = permitted.some((t) => SEARCH_ENTITY_REGISTRY[t].locationAware);
    const locationIds = needsLocation
      ? await this.locationScopeService.getUserLocationIds(user.id)
      : null;

    const tasks = permitted.map((type) =>
      this.searchByType(type, user.organizationId, q, limit, locationIds).then((results) => ({
        type,
        results,
      })),
    );

    const settled = await Promise.all(tasks);

    const byType: Partial<Record<SearchEntityType, SearchResultDto[]>> = {};
    const flat: SearchResultDto[] = [];
    for (const { type, results } of settled) {
      byType[type] = results;
      flat.push(...results);
    }

    return {
      query: q,
      total: flat.length,
      results: flat,
      byType,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  private emptyResponse(q: string): GlobalSearchResponseDto {
    return { query: q, total: 0, results: [], byType: {} };
  }

  private parseTypes(raw?: string): SearchEntityType[] {
    if (!raw) return [...SEARCH_ENTITY_TYPES];
    const parts = raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(isSearchEntityType);
    // Preserve registry order & deduplicate.
    const requested = new Set(parts);
    return SEARCH_ENTITY_TYPES.filter((t) => requested.has(t));
  }

  private filterByPermissions(user: AuthUser, types: SearchEntityType[]): SearchEntityType[] {
    const perms = new Set(user.permissions ?? []);
    return types.filter((t) => perms.has(SEARCH_ENTITY_REGISTRY[t].permission));
  }

  private searchByType(
    type: SearchEntityType,
    organizationId: string,
    q: string,
    limit: number,
    locationIds: string[] | null,
  ): Promise<SearchResultDto[]> {
    switch (type) {
      case 'PRODUCT':         return this.searchProducts(organizationId, q, limit);
      case 'CUSTOMER':        return this.searchCustomers(organizationId, q, limit);
      case 'ORDER':           return this.searchOrders(organizationId, q, limit, locationIds);
      case 'INVOICE':         return this.searchInvoices(organizationId, q, limit);
      case 'STAFF':           return this.searchStaff(organizationId, q, limit, locationIds);
      case 'SUPPLIER':        return this.searchSuppliers(organizationId, q, limit);
      case 'TRANSACTION':     return this.searchTransactions(organizationId, q, limit);
      case 'SERIALIZED_UNIT': return this.searchSerializedUnits(organizationId, q, limit, locationIds);
      case 'TASK':            return this.searchTasks(organizationId, q, limit);
    }
  }

  private formatAmount(amount: unknown): string {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '₦0.00';
    return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatDate(d: Date | null | undefined): string {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: '2-digit' });
    } catch {
      return '';
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Entity searches
  // ─────────────────────────────────────────────────────────────

  private async searchProducts(organizationId: string, q: string, limit: number): Promise<SearchResultDto[]> {
    const rows = await this.prisma.product.findMany({
      where: {
        organizationId,
        OR: [
          { name:    { contains: q, mode: 'insensitive' } },
          { sku:     { contains: q, mode: 'insensitive' } },
          { barcode: { equals: q } },
          { gtin:    { equals: q } },
          { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      select: { id: true, name: true, sku: true, barcode: true, status: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((p) => ({
      type: 'PRODUCT' as const,
      id: p.id,
      title: p.name,
      subtitle: `SKU: ${p.sku}`,
      route: `/products/${p.id}`,
      metadata: { status: String(p.status) },
    }));
  }

  private async searchCustomers(organizationId: string, q: string, limit: number): Promise<SearchResultDto[]> {
    const rows = await this.prisma.customer.findMany({
      where: {
        organizationId,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName:  { contains: q, mode: 'insensitive' } },
          { phone:     { contains: q } },
          { email:     { contains: q, mode: 'insensitive' } },
          { code:      { equals: q, mode: 'insensitive' } },
        ],
      },
      // IMPORTANT: do NOT select totalSpent, creditLimit, outstandingBalance, loyaltyPoints
      select: { id: true, firstName: true, lastName: true, phone: true, email: true, code: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((c) => ({
      type: 'CUSTOMER' as const,
      id: c.id,
      title: `${c.firstName} ${c.lastName}`.trim(),
      subtitle: c.phone,
      route: `/customers/${c.id}`,
      metadata: { code: c.code },
    }));
  }

  private async searchOrders(
    organizationId: string,
    q: string,
    limit: number,
    locationIds: string[] | null,
  ): Promise<SearchResultDto[]> {
    // Deny-all fast path: location-scoped user with zero authorized locations.
    if (Array.isArray(locationIds) && locationIds.length === 0) return [];

    const where: Record<string, unknown> = {
      organizationId,
      OR: [
        { reference: { contains: q, mode: 'insensitive' } },
        { customer: { firstName: { contains: q, mode: 'insensitive' } } },
        { customer: { lastName:  { contains: q, mode: 'insensitive' } } },
      ],
    };

    if (locationIds !== null) {
      where.locationId = { in: locationIds };
    }

    const rows = await this.prisma.salesOrder.findMany({
      where: where as never,
      select: {
        id: true, reference: true, status: true, totalAmount: true, locationId: true,
        customer: { select: { id: true, firstName: true, lastName: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((o) => ({
      type: 'ORDER' as const,
      id: o.id,
      title: o.reference,
      subtitle: `${o.status} • ${this.formatAmount(o.totalAmount)}`,
      route: `/sales/orders/${o.id}`,
      metadata: {
        status: String(o.status),
        customer: o.customer ? `${o.customer.firstName} ${o.customer.lastName}`.trim() : '',
      },
    }));
  }

  private async searchInvoices(organizationId: string, q: string, limit: number): Promise<SearchResultDto[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        OR: [
          { reference: { contains: q, mode: 'insensitive' } },
          { customer: { firstName: { contains: q, mode: 'insensitive' } } },
          { customer: { lastName:  { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true, reference: true, status: true, totalAmount: true,
        customer: { select: { id: true, firstName: true, lastName: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((i) => ({
      type: 'INVOICE' as const,
      id: i.id,
      title: i.reference,
      subtitle: `${i.status} • ${this.formatAmount(i.totalAmount)}`,
      route: `/sales/invoices/${i.id}`,
      metadata: {
        status: String(i.status),
        customer: i.customer ? `${i.customer.firstName} ${i.customer.lastName}`.trim() : '',
      },
    }));
  }

  private async searchStaff(
    organizationId: string,
    q: string,
    limit: number,
    locationIds: string[] | null,
  ): Promise<SearchResultDto[]> {
    if (Array.isArray(locationIds) && locationIds.length === 0) return [];

    const where: Record<string, unknown> = {
      organizationId,
      OR: [
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { lastName:  { contains: q, mode: 'insensitive' } } },
        { user: { email:     { contains: q, mode: 'insensitive' } } },
        { employeeNumber: { contains: q, mode: 'insensitive' } },
      ],
    };

    if (locationIds !== null) {
      where.locationId = { in: locationIds };
    }

    const rows = await this.prisma.employee.findMany({
      where: where as never,
      // IMPORTANT: never select salary, bankName, bankAccount, bankCode, emergencyName, emergencyPhone
      select: {
        id: true, employeeNumber: true, jobTitle: true, locationId: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        department: { select: { name: true } },
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((e) => {
      const parts: string[] = [];
      if (e.jobTitle) parts.push(e.jobTitle);
      if (e.department?.name) parts.push(e.department.name);
      return {
        type: 'STAFF' as const,
        id: e.id,
        title: `${e.user.firstName} ${e.user.lastName}`.trim(),
        subtitle: parts.join(' • ') || e.employeeNumber,
        route: `/staff/${e.id}`,
        metadata: { employeeNumber: e.employeeNumber },
      };
    });
  }

  private async searchSuppliers(organizationId: string, q: string, limit: number): Promise<SearchResultDto[]> {
    const rows = await this.prisma.supplier.findMany({
      where: {
        organizationId,
        OR: [
          { name:  { contains: q, mode: 'insensitive' } },
          { code:  { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      // IMPORTANT: never select bankName, bankAccount, bankCode, taxId
      select: { id: true, name: true, code: true, phone: true, email: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((s) => ({
      type: 'SUPPLIER' as const,
      id: s.id,
      title: s.name,
      subtitle: s.code,
      route: `/suppliers/${s.id}`,
      metadata: {
        ...(s.phone ? { phone: s.phone } : {}),
        ...(s.email ? { email: s.email } : {}),
      },
    }));
  }

  private async searchTransactions(organizationId: string, q: string, limit: number): Promise<SearchResultDto[]> {
    const [payments, expenses, bankTxs] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          organizationId,
          OR: [
            { reference:  { contains: q, mode: 'insensitive' } },
            { gatewayRef: { contains: q, mode: 'insensitive' } },
          ],
        },
        // IMPORTANT: never select gatewayData
        select: { id: true, reference: true, amount: true, method: true, status: true },
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          OR: [
            { reference:   { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { vendor:      { contains: q, mode: 'insensitive' } },
          ],
        },
        // IMPORTANT: never select bankAccountId
        select: { id: true, reference: true, amount: true, description: true, vendor: true, status: true },
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bankTransaction.findMany({
        where: {
          organizationId,
          OR: [
            { description: { contains: q, mode: 'insensitive' } },
            { reference:   { contains: q, mode: 'insensitive' } },
          ],
        },
        // IMPORTANT: never select balanceBefore, balanceAfter
        select: { id: true, description: true, amount: true, type: true, reference: true },
        take: limit,
        orderBy: { date: 'desc' },
      }),
    ]);

    const paymentResults: SearchResultDto[] = payments.map((p) => ({
      type: 'TRANSACTION' as const,
      id: p.id,
      title: p.reference,
      subtitle: `${p.method} • ${this.formatAmount(p.amount)}`,
      route: '/finance',
      metadata: { source: 'PAYMENT', status: String(p.status) },
    }));

    const expenseResults: SearchResultDto[] = expenses.map((e) => ({
      type: 'TRANSACTION' as const,
      id: e.id,
      title: e.reference,
      subtitle: `${this.formatAmount(e.amount)} • ${(e.description ?? '').slice(0, 50)}`,
      route: '/finance/expenses',
      metadata: {
        source: 'EXPENSE',
        status: String(e.status),
        ...(e.vendor ? { vendor: e.vendor } : {}),
      },
    }));

    const bankTxResults: SearchResultDto[] = bankTxs.map((b) => ({
      type: 'TRANSACTION' as const,
      id: b.id,
      title: b.reference ?? b.description.slice(0, 50),
      subtitle: `${b.type} • ${this.formatAmount(b.amount)}`,
      route: '/finance',
      metadata: { source: 'BANK_TRANSACTION', txType: String(b.type) },
    }));

    // Deduplicate by (source, id) — the three tables cannot collide on id in practice,
    // but we tag the source in metadata so clients can disambiguate.
    const combined = [...paymentResults, ...expenseResults, ...bankTxResults];
    const seen = new Set<string>();
    const deduped: SearchResultDto[] = [];
    for (const r of combined) {
      const key = `${r.metadata?.source ?? ''}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
      if (deduped.length >= limit) break;
    }

    return deduped;
  }

  private async searchSerializedUnits(
    organizationId: string,
    q: string,
    limit: number,
    locationIds: string[] | null,
  ): Promise<SearchResultDto[]> {
    if (Array.isArray(locationIds) && locationIds.length === 0) return [];

    const where: Record<string, unknown> = {
      organizationId,
      OR: [
        { imei1:        { startsWith: q } },
        { imei2:        { startsWith: q } },
        { serialNumber: { startsWith: q } },
        { imei1:        { equals: q } },
        { imei2:        { equals: q } },
        { serialNumber: { equals: q } },
      ],
    };

    if (locationIds !== null) {
      where.locationId = { in: locationIds };
    }

    const rows = await this.prisma.serializedUnit.findMany({
      where: where as never,
      select: {
        id: true, imei1: true, imei2: true, serialNumber: true, status: true, locationId: true,
        product: { select: { id: true, name: true, sku: true } },
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((u) => ({
      type: 'SERIALIZED_UNIT' as const,
      id: u.id,
      title: u.imei1,
      subtitle: u.product?.name ?? 'Unknown Product',
      route: '/serialized-units',
      metadata: {
        status: String(u.status),
        ...(u.serialNumber ? { serialNumber: u.serialNumber } : {}),
        ...(u.product?.sku ? { productSku: u.product.sku } : {}),
      },
    }));
  }

  private async searchTasks(organizationId: string, q: string, limit: number): Promise<SearchResultDto[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        organizationId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { tags:  { has: q } },
        ],
      },
      select: {
        id: true, title: true, status: true, priority: true, dueDate: true, assigneeId: true,
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((t) => {
      const due = t.dueDate ? `Due: ${this.formatDate(t.dueDate)}` : 'No due date';
      return {
        type: 'TASK' as const,
        id: t.id,
        title: t.title,
        subtitle: `${t.status} • ${due}`,
        route: '/tasks',
        metadata: { status: String(t.status), priority: String(t.priority) },
      };
    });
  }
}
