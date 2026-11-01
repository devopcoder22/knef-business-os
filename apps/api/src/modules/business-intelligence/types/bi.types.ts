// ─── Fact / Analysis / Forecast / Recommendation label types ─────────────────

export type DataLabel = 'FACT' | 'ANALYSIS' | 'ASSUMPTION' | 'FORECAST' | 'RECOMMENDATION';

// ─── Executive Snapshot ───────────────────────────────────────────────────────

export interface PeriodComparison {
  current: number;
  previous: number;
  change: number;
  changePercent: number | null; // null when previous is 0
}

export interface ExecutiveSnapshot {
  generatedAt: string;
  period: { startDate: string; endDate: string };
  // Sales facts
  salesToday: number;
  salesThisWeek: number;
  salesThisMonth: number;
  ordersThisMonth: number;
  avgOrderValue: number;
  // Inventory facts
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  // Purchasing facts
  pendingPurchaseOrders: number;
  pendingPurchaseOrderValue: number;
  // Finance facts
  unpaidInvoicesCount: number;
  unpaidInvoicesValue: number;
  expensesThisMonth: number;
  // Tasks & Goals
  overdueTasks: number;
  activeGoals: number;
  goalsOnTrack: number;
  goalsAtRisk: number;
  // Customers
  newCustomersThisMonth: number;
  activeCustomersThisMonth: number;
  _label: 'FACT';
}

// ─── Sales Intelligence ───────────────────────────────────────────────────────

export interface SalesIntelligence {
  generatedAt: string;
  period: { startDate: string; endDate: string };
  // Current period facts
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgOrderValue: number;
  // Comparison (FACT)
  revenueComparison: PeriodComparison;
  ordersComparison: PeriodComparison;
  // Top performers (FACT)
  topProducts: TopProductItem[];
  bottomProducts: TopProductItem[];
  // Sales by category (FACT)
  byCategory: CategorySalesItem[];
  // Daily trend (FACT)
  dailyTrend: DailyTrendItem[];
  _label: 'FACT';
}

export interface TopProductItem {
  productId: string;
  name: string;
  sku: string;
  quantitySold: number;
  revenue: number;
  grossProfit: number;
}

export interface CategorySalesItem {
  categoryId: string | null;
  categoryName: string;
  revenue: number;
  quantity: number;
}

export interface DailyTrendItem {
  date: string;
  revenue: number;
  orders: number;
}

// ─── Inventory Intelligence ───────────────────────────────────────────────────

export interface InventoryIntelligence {
  generatedAt: string;
  totalStockValue: number;
  totalProducts: number;
  lowStockItems: LowStockItem[];
  outOfStockItems: OutOfStockItem[];
  fastMovers: MovingItem[];
  slowMovers: MovingItem[];
  _label: 'FACT';
}

export interface LowStockItem {
  productId: string;
  name: string;
  sku: string;
  currentStock: number;
  lowStockAlert: number;
  incomingStock: number;
  locationId?: string;
  locationName?: string;
}

export interface OutOfStockItem {
  productId: string;
  name: string;
  sku: string;
  incomingStock: number;
}

export interface MovingItem {
  productId: string;
  name: string;
  sku: string;
  unitsSold30Days: number;
  currentStock: number;
  daysOfStockRemaining: number | null;
}

// ─── Purchasing Intelligence ──────────────────────────────────────────────────

export interface PurchasingIntelligence {
  generatedAt: string;
  period: { startDate: string; endDate: string };
  pendingOrders: number;
  pendingOrderValue: number;
  incomingStock: IncomingStockItem[];
  supplierSummary: SupplierSummaryItem[];
  _label: 'FACT';
}

export interface IncomingStockItem {
  purchaseOrderId: string;
  reference: string;
  supplierId: string;
  supplierName: string;
  expectedDate: string | null;
  totalAmount: number;
  status: string;
}

export interface SupplierSummaryItem {
  supplierId: string;
  supplierName: string;
  orderCount: number;
  totalSpent: number;
  pendingOrders: number;
}

// ─── Customer Intelligence ────────────────────────────────────────────────────

export interface CustomerIntelligence {
  generatedAt: string;
  period: { startDate: string; endDate: string };
  totalCustomers: number;
  newThisPeriod: number;
  activeThisPeriod: number;
  repeatCustomers: number;
  inactiveCustomers: number; // no orders in 90 days
  topCustomers: TopCustomerItem[];
  _label: 'FACT';
}

export interface TopCustomerItem {
  customerId: string;
  firstName: string;
  lastName: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string | null;
  segment: CustomerSegmentLabel;
}

export type CustomerSegmentLabel = 'NEW' | 'REPEAT' | 'HIGH_VALUE' | 'INACTIVE' | 'AT_RISK';

// ─── Goal / KPI Intelligence ──────────────────────────────────────────────────

export interface GoalIntelligence {
  generatedAt: string;
  totalActive: number;
  onTrack: number;
  atRisk: number;
  achieved: number;
  missed: number;
  goals: GoalInsightItem[];
  _label: 'FACT';
}

export interface GoalInsightItem {
  goalId: string;
  title: string;
  status: string;
  progress: number;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  kpis: KpiInsightItem[];
  progressTrend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'UNKNOWN';
  onTrack: boolean;
}

export interface KpiInsightItem {
  kpiId: string;
  name: string;
  target: number;
  current: number;
  unit: string | null;
  achievementPercent: number;
}

// ─── Forecasting ──────────────────────────────────────────────────────────────

export type ForecastMethod = 'MOVING_AVERAGE' | 'WEIGHTED_MOVING_AVERAGE' | 'INSUFFICIENT_DATA';

export interface ForecastResult {
  metric: string;
  historicalWindowDays: number;
  forecastHorizonDays: number;
  method: ForecastMethod;
  projectedValue: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  assumptions: string[];
  limitations: string[];
  dataPoints: number;
  dailyProjections?: DailyProjection[];
  _label: 'FORECAST';
}

export interface DailyProjection {
  date: string;
  projected: number;
}

export interface InventoryDepletionForecast {
  productId: string;
  name: string;
  currentStock: number;
  avgDailySales: number;
  daysRemaining: number | null;
  projectedStockoutDate: string | null;
  _label: 'FORECAST';
}

// ─── Simulation ───────────────────────────────────────────────────────────────

export interface SimulationInput {
  scenario: 'SALES_CHANGE' | 'MARGIN_CHANGE' | 'EXPENSE_CHANGE' | 'DEMAND_CHANGE' | 'REORDER';
  baselinePeriodDays?: number;
  parameters: Record<string, number | string>;
}

export interface SimulationResult {
  scenario: string;
  _label: 'SIMULATION';
  WARNING: 'THIS IS A SIMULATION — NOT ACTUAL BUSINESS DATA';
  baseline: Record<string, number | string>;
  assumptions: string[];
  simulatedInputs: Record<string, number | string>;
  calculatedOutcome: Record<string, number | string>;
  differences: Record<string, number | string>;
  caveats: string[];
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  _label: 'RECOMMENDATION';
  supportingFacts: string[];
  reasoning: string;
  expectedBenefit: string;
  risk: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  entityId?: string;
  entityType?: string;
  entityName?: string;
}

export type RecommendationType =
  | 'REORDER'
  | 'INVESTIGATE_PRODUCT'
  | 'FOLLOW_UP_CUSTOMER'
  | 'REDUCE_EXCESS_STOCK'
  | 'REVIEW_EXPENSES'
  | 'PROMOTE_PRODUCT'
  | 'REENGAGE_CUSTOMERS'
  | 'REVIEW_SLOW_MOVER'
  | 'GOAL_AT_RISK';

// ─── AI Ask ───────────────────────────────────────────────────────────────────

export interface AskResult {
  answer: string;
  dataUsed: string[];
  _label: 'ANALYSIS';
  disclaimer: string;
}
