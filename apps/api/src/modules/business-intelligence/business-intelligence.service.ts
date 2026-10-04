import { Injectable, Logger } from '@nestjs/common';
import { BusinessMetricsService } from './business-metrics.service';
import { ForecastingService } from './forecasting.service';
import { SimulationService } from './simulation.service';
import { RecommendationService } from './recommendation.service';
import { AICompletionService } from '../ai/ai-completion.service';
import type {
  ExecutiveSnapshot,
  SalesIntelligence,
  InventoryIntelligence,
  PurchasingIntelligence,
  CustomerIntelligence,
  GoalIntelligence,
  ForecastResult,
  InventoryDepletionForecast,
  SimulationInput,
  SimulationResult,
  Recommendation,
  AskResult,
} from './types/bi.types';

const BI_SYSTEM_PROMPT = `You are a business intelligence analyst for KNEF Business OS.
You receive structured, pre-calculated business metrics and provide concise management insights.

CRITICAL RULES:
1. Only reference the data provided — never invent numbers, revenue, stock levels, or customer counts.
2. Clearly label your outputs: ANALYSIS for interpretations, FORECAST for projections, RECOMMENDATION for actions.
3. Be concise and actionable. Avoid jargon.
4. If data is insufficient, say so explicitly.
5. Never suggest executing actions directly — all actions require user approval through the system.
6. Do NOT generate SQL queries.`;

@Injectable()
export class BusinessIntelligenceService {
  private readonly logger = new Logger(BusinessIntelligenceService.name);

  constructor(
    private readonly metrics: BusinessMetricsService,
    private readonly forecasting: ForecastingService,
    private readonly simulation: SimulationService,
    private readonly recommendations: RecommendationService,
    private readonly aiCompletion: AICompletionService,
  ) {}

  // ─── Executive Overview ─────────────────────────────────────────────────────

  async getOverview(
    organizationId: string,
    userId: string,
    locationIds: string[] | null,
  ): Promise<{ snapshot: ExecutiveSnapshot; narrative: string | null }> {
    const snapshot = await this.metrics.getExecutiveSnapshot(organizationId, locationIds);

    let narrative: string | null = null;
    try {
      const context = this.buildSnapshotContext(snapshot);
      const result = await this.aiCompletion.complete({
        organizationId,
        userId,
        taskType: 'business_intelligence',
        systemPrompt: BI_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Provide a concise executive business summary (3-5 sentences) based on these metrics:\n\n${context}\n\nFocus on what is most important right now.`,
          },
        ],
        maxTokens: 400,
        temperature: 0,
      });
      narrative = result.content;
    } catch (err) {
      this.logger.warn('AI narrative unavailable for overview', err);
    }

    return { snapshot, narrative };
  }

  // ─── Domain Intelligence ────────────────────────────────────────────────────

  async getSalesIntelligence(
    organizationId: string,
    startDate: string,
    endDate: string,
    locationIds: string[] | null,
  ): Promise<SalesIntelligence> {
    return this.metrics.getSalesIntelligence(organizationId, startDate, endDate, locationIds);
  }

  async getInventoryIntelligence(
    organizationId: string,
    locationIds: string[] | null,
  ): Promise<InventoryIntelligence> {
    return this.metrics.getInventoryIntelligence(organizationId, locationIds);
  }

  async getPurchasingIntelligence(
    organizationId: string,
    startDate: string,
    endDate: string,
    locationIds: string[] | null,
  ): Promise<PurchasingIntelligence> {
    return this.metrics.getPurchasingIntelligence(organizationId, startDate, endDate, locationIds);
  }

  async getCustomerIntelligence(
    organizationId: string,
    startDate: string,
    endDate: string,
  ): Promise<CustomerIntelligence> {
    return this.metrics.getCustomerIntelligence(organizationId, startDate, endDate);
  }

  async getGoalIntelligence(organizationId: string): Promise<GoalIntelligence> {
    return this.metrics.getGoalIntelligence(organizationId);
  }

  // ─── Forecasting ────────────────────────────────────────────────────────────

  async forecastSales(
    organizationId: string,
    locationIds: string[] | null,
    horizonDays: number,
    windowDays: number,
  ): Promise<ForecastResult> {
    return this.forecasting.forecastSales(organizationId, locationIds, horizonDays, windowDays);
  }

  async forecastInventoryDepletion(
    organizationId: string,
    locationIds: string[] | null,
    productIds?: string[],
  ): Promise<InventoryDepletionForecast[]> {
    return this.forecasting.forecastInventoryDepletion(organizationId, locationIds, productIds);
  }

  // ─── Simulation ─────────────────────────────────────────────────────────────

  async simulate(
    organizationId: string,
    locationIds: string[] | null,
    input: SimulationInput,
  ): Promise<SimulationResult> {
    // Simulation NEVER mutates database — enforced in SimulationService
    return this.simulation.simulate(organizationId, locationIds, input);
  }

  // ─── Recommendations ────────────────────────────────────────────────────────

  async getRecommendations(
    organizationId: string,
    locationIds: string[] | null,
  ): Promise<Recommendation[]> {
    return this.recommendations.getRecommendations(organizationId, locationIds);
  }

  // ─── AI Ask ─────────────────────────────────────────────────────────────────

  async ask(
    organizationId: string,
    userId: string,
    locationIds: string[] | null,
    question: string,
  ): Promise<AskResult> {
    // Build structured context — AI never gets raw DB access
    const [snapshot, salesData, inventoryData, goalData] = await Promise.all([
      this.metrics.getExecutiveSnapshot(organizationId, locationIds),
      this.metrics.getSalesIntelligence(
        organizationId,
        new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
        new Date().toISOString().slice(0, 10),
        locationIds,
      ),
      this.metrics.getInventoryIntelligence(organizationId, locationIds),
      this.metrics.getGoalIntelligence(organizationId),
    ]);

    const dataUsed = ['executive_snapshot', 'sales_this_month', 'inventory_levels', 'goals'];

    // Minimize context — only aggregated facts, no PII, no raw records
    const context = `
BUSINESS SNAPSHOT (${snapshot.generatedAt}):
- Sales today: ${snapshot.salesToday}
- Sales this month: ${snapshot.salesThisMonth}
- Orders this month: ${snapshot.ordersThisMonth}
- Low stock items: ${snapshot.lowStockCount}
- Out of stock: ${snapshot.outOfStockCount}
- Pending purchase orders: ${snapshot.pendingPurchaseOrders} (value: ${snapshot.pendingPurchaseOrderValue})
- Unpaid invoices: ${snapshot.unpaidInvoicesCount} (value: ${snapshot.unpaidInvoicesValue})
- Overdue tasks: ${snapshot.overdueTasks}
- Active goals: ${snapshot.activeGoals} (on track: ${snapshot.goalsOnTrack}, at risk: ${snapshot.goalsAtRisk})

SALES (this month):
- Total revenue: ${salesData.totalRevenue}
- Total orders: ${salesData.totalOrders}
- Revenue change vs prior period: ${salesData.revenueComparison.changePercent !== null ? salesData.revenueComparison.changePercent.toFixed(1) + '%' : 'N/A'}
- Top product: ${salesData.topProducts[0] ? `${salesData.topProducts[0].name} (${salesData.topProducts[0].revenue})` : 'N/A'}

INVENTORY:
- Total stock value: ${inventoryData.totalStockValue}
- Low stock products: ${inventoryData.lowStockItems.length}
- Out of stock products: ${inventoryData.outOfStockItems.length}

GOALS: ${goalData.totalActive} active goals, ${goalData.onTrack} on track, ${goalData.atRisk} at risk.
`.trim();

    let answer: string;
    try {
      const result = await this.aiCompletion.complete({
        organizationId,
        userId,
        taskType: 'business_intelligence',
        systemPrompt: BI_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Business context:\n${context}\n\nQuestion: ${question}`,
          },
        ],
        maxTokens: 600,
        temperature: 0,
      });
      answer = result.content;
    } catch {
      answer = 'AI narrative is currently unavailable. Please review the structured data directly.';
    }

    return {
      answer,
      dataUsed,
      _label: 'ANALYSIS',
      disclaimer:
        'This analysis is based on pre-calculated metrics from your business data. AI interpretations are advisory only and must not be treated as authoritative financial records.',
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildSnapshotContext(s: ExecutiveSnapshot): string {
    return `
Sales today: ${s.salesToday} | This week: ${s.salesThisWeek} | This month: ${s.salesThisMonth}
Orders this month: ${s.ordersThisMonth} | Avg order value: ${s.avgOrderValue}
Inventory value: ${s.inventoryValue} | Low stock: ${s.lowStockCount} | Out of stock: ${s.outOfStockCount}
Pending POs: ${s.pendingPurchaseOrders} (₦${s.pendingPurchaseOrderValue})
Unpaid invoices: ${s.unpaidInvoicesCount} (₦${s.unpaidInvoicesValue})
Expenses this month: ${s.expensesThisMonth}
Overdue tasks: ${s.overdueTasks}
Active goals: ${s.activeGoals} | On track: ${s.goalsOnTrack} | At risk: ${s.goalsAtRisk}
New customers this month: ${s.newCustomersThisMonth}
`.trim();
  }
}
