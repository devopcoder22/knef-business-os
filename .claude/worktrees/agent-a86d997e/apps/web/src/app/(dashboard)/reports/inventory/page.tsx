'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = ['Valuation', 'Movement', 'Low Stock', 'Turnover'] as const;
type Tab = (typeof TABS)[number];

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(n);
}

interface ValuationData {
  totalItems: number;
  totalUnits: number;
  totalCostValue: number;
  totalRetailValue: number;
  potentialProfit: number;
  byCategory: { name: string; items: number; units: number; costValue: number; retailValue: number }[];
  byLocation: { locationId: string; name: string; units: number; costValue: number }[];
}

interface LowStockItem {
  productId: string;
  name: string;
  sku: string;
  locationId: string;
  locationName: string;
  quantity: number;
  lowStockAlert: number;
}

interface MovementItem {
  id: string;
  productName: string;
  sku: string;
  locationName: string;
  type: string;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceType: string | null;
  createdAt: string;
}

interface TurnoverItem {
  productId: string;
  name: string;
  sku: string;
  openingStock: number;
  closingStock: number;
  sold: number;
  received: number;
  turnoverRate: number;
  daysOfInventory: number;
}

const MOVEMENT_COLORS: Record<string, string> = {
  SALE: 'bg-red-100 text-red-700',
  PURCHASE_RECEIPT: 'bg-green-100 text-green-700',
  RETURN_IN: 'bg-blue-100 text-blue-700',
  RETURN_OUT: 'bg-orange-100 text-orange-700',
  TRANSFER_IN: 'bg-indigo-100 text-indigo-700',
  TRANSFER_OUT: 'bg-purple-100 text-purple-700',
  ADJUSTMENT_ADD: 'bg-teal-100 text-teal-700',
  ADJUSTMENT_REMOVE: 'bg-rose-100 text-rose-700',
  COUNT_CORRECTION: 'bg-gray-100 text-gray-700',
  OPENING_STOCK: 'bg-amber-100 text-amber-700',
};

function InventoryReportContent() {
  const searchParams = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [activeTab, setActiveTab] = useState<Tab>('Valuation');
  const [startDate, setStartDate] = useState(searchParams.get('startDate') ?? monthStart);
  const [endDate, setEndDate] = useState(searchParams.get('endDate') ?? today);
  const [locationId, setLocationId] = useState('');
  const [movementType, setMovementType] = useState('');

  const { data: valuationRes, isLoading: valuationLoading } = useQuery<{ data: ValuationData }>({
    queryKey: ['reports-inventory-valuation', locationId],
    queryFn: () =>
      api()
        .get<{ data: ValuationData }>(`/reports/inventory/valuation${locationId ? `?locationId=${locationId}` : ''}`)
        .then(r => r.data),
    enabled: activeTab === 'Valuation',
  });

  const { data: lowStockRes, isLoading: lowStockLoading } = useQuery<{ data: LowStockItem[] }>({
    queryKey: ['reports-inventory-low-stock', locationId],
    queryFn: () =>
      api()
        .get<{ data: LowStockItem[] }>(`/reports/inventory/low-stock${locationId ? `?locationId=${locationId}` : ''}`)
        .then(r => r.data),
    enabled: activeTab === 'Low Stock',
  });

  const { data: movementRes, isLoading: movementLoading } = useQuery<{ data: MovementItem[]; total: number }>({
    queryKey: ['reports-inventory-movement', startDate, endDate, locationId, movementType],
    queryFn: () => {
      const p = new URLSearchParams({ startDate, endDate });
      if (locationId) p.set('locationId', locationId);
      if (movementType) p.set('type', movementType);
      return api()
        .get<{ data: MovementItem[]; total: number }>(`/reports/inventory/movement?${p}`)
        .then(r => r.data);
    },
    enabled: activeTab === 'Movement',
  });

  const { data: turnoverRes, isLoading: turnoverLoading } = useQuery<{ data: TurnoverItem[] }>({
    queryKey: ['reports-inventory-turnover', startDate, endDate, locationId],
    queryFn: () => {
      const p = new URLSearchParams({ startDate, endDate });
      if (locationId) p.set('locationId', locationId);
      return api()
        .get<{ data: TurnoverItem[] }>(`/reports/inventory/turnover?${p}`)
        .then(r => r.data);
    },
    enabled: activeTab === 'Turnover',
  });

  const valuation = valuationRes?.data;
  const lowStock = lowStockRes?.data ?? [];
  const movements = movementRes?.data ?? [];
  const turnover = turnoverRes?.data ?? [];

  async function handleExport(type: 'valuation' | 'movement' | 'low-stock') {
    const url = `/reports/inventory/export?format=csv&type=${type}`;
    const res = await api().get(url, { responseType: 'blob' });
    const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-${type}-export.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Report</h1>
        <div className="flex gap-2">
          {activeTab === 'Movement' || activeTab === 'Turnover' ? (
            <>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            </>
          ) : null}
          <button
            onClick={() => {
              const t = activeTab === 'Valuation' ? 'valuation' : activeTab === 'Low Stock' ? 'low-stock' : 'movement';
              void handleExport(t as 'valuation' | 'movement' | 'low-stock');
            }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-indigo-700"
          >
            <Download size={15} />
            Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Valuation Tab */}
      {activeTab === 'Valuation' && (
        <div className="space-y-4">
          {valuationLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Distinct Products', value: String(valuation?.totalItems ?? 0) },
                  { label: 'Total Units', value: String(valuation?.totalUnits ?? 0) },
                  { label: 'Cost Value', value: fmt(valuation?.totalCostValue ?? 0) },
                  { label: 'Retail Value', value: fmt(valuation?.totalRetailValue ?? 0) },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">{kpi.label}</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">By Category</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 font-medium text-right">Products</th>
                        <th className="pb-2 font-medium text-right">Units</th>
                        <th className="pb-2 font-medium text-right">Cost Value</th>
                        <th className="pb-2 font-medium text-right">Retail Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(valuation?.byCategory ?? []).map(cat => (
                        <tr key={cat.name} className="hover:bg-gray-50">
                          <td className="py-2.5 font-medium">{cat.name}</td>
                          <td className="py-2.5 text-right">{cat.items}</td>
                          <td className="py-2.5 text-right">{cat.units}</td>
                          <td className="py-2.5 text-right">{fmt(cat.costValue)}</td>
                          <td className="py-2.5 text-right text-emerald-600">{fmt(cat.retailValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Low Stock Tab */}
      {activeTab === 'Low Stock' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Low Stock Items
            <span className="ml-2 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
              {lowStock.length} items
            </span>
          </h3>
          {lowStockLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium">Location</th>
                    <th className="pb-2 font-medium text-right">Qty</th>
                    <th className="pb-2 font-medium text-right">Alert Level</th>
                    <th className="pb-2 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lowStock.map(item => (
                    <tr key={`${item.productId}-${item.locationId}`} className="hover:bg-gray-50">
                      <td className="py-2.5">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-400">{item.sku}</p>
                      </td>
                      <td className="py-2.5 text-gray-600">{item.locationName}</td>
                      <td className="py-2.5 text-right font-bold">{item.quantity}</td>
                      <td className="py-2.5 text-right text-gray-500">{item.lowStockAlert}</td>
                      <td className="py-2.5 text-right">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          item.quantity === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700',
                        )}>
                          {item.quantity === 0 ? 'Out of Stock' : 'Low Stock'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {lowStock.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400 text-sm">
                        No low-stock items
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Movement Tab */}
      {activeTab === 'Movement' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Movement Log</h3>
            <select
              value={movementType}
              onChange={e => setMovementType(e.target.value)}
              className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All Types</option>
              {Object.keys(MOVEMENT_COLORS).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {movementLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium">Location</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium text-right">Qty</th>
                    <th className="pb-2 font-medium text-right">Before</th>
                    <th className="pb-2 font-medium text-right">After</th>
                    <th className="pb-2 font-medium text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {movements.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="py-2.5">
                        <p className="font-medium text-gray-900">{m.productName}</p>
                        <p className="text-xs text-gray-400">{m.sku}</p>
                      </td>
                      <td className="py-2.5 text-gray-600">{m.locationName}</td>
                      <td className="py-2.5">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', MOVEMENT_COLORS[m.type] ?? 'bg-gray-100 text-gray-700')}>
                          {m.type}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-medium">{m.quantity}</td>
                      <td className="py-2.5 text-right text-gray-500">{m.quantityBefore}</td>
                      <td className="py-2.5 text-right text-gray-500">{m.quantityAfter}</td>
                      <td className="py-2.5 text-right text-gray-400">{m.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 text-sm">
                        No movement data for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Turnover Tab */}
      {activeTab === 'Turnover' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Inventory Turnover</h3>
          {turnoverLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium text-right">Opening</th>
                    <th className="pb-2 font-medium text-right">Closing</th>
                    <th className="pb-2 font-medium text-right">Sold</th>
                    <th className="pb-2 font-medium text-right">Received</th>
                    <th className="pb-2 font-medium text-right">Turnover Rate</th>
                    <th className="pb-2 font-medium text-right">Days of Inventory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {turnover.map(t => (
                    <tr key={t.productId} className="hover:bg-gray-50">
                      <td className="py-2.5">
                        <p className="font-medium text-gray-900">{t.name}</p>
                        <p className="text-xs text-gray-400">{t.sku}</p>
                      </td>
                      <td className="py-2.5 text-right">{t.openingStock}</td>
                      <td className="py-2.5 text-right">{t.closingStock}</td>
                      <td className="py-2.5 text-right text-red-600">{t.sold}</td>
                      <td className="py-2.5 text-right text-emerald-600">{t.received}</td>
                      <td className="py-2.5 text-right font-medium">{t.turnoverRate.toFixed(2)}x</td>
                      <td className="py-2.5 text-right">{t.daysOfInventory > 0 ? `${t.daysOfInventory}d` : '—'}</td>
                    </tr>
                  ))}
                  {turnover.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 text-sm">
                        No data for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InventoryReportPage() {
  return (
    <Suspense fallback={<div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />}>
      <InventoryReportContent />
    </Suspense>
  );
}
