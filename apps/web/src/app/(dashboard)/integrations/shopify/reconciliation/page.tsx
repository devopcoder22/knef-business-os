'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BarChart2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ShopifyConnection {
  id: string;
  displayName: string;
  externalAccountName: string | null;
}

interface DiscrepancyItem {
  productId: string;
  productName: string;
  sku: string;
  issueType: string;
  knefValue: string | number;
  shopifyValue: string | number;
  severity: 'high' | 'medium' | 'low';
}

interface ReconciliationResult {
  runAt: string;
  totalChecked: number;
  discrepancies: DiscrepancyItem[];
  summary: {
    priceMismatch: number;
    inventoryMismatch: number;
    statusMismatch: number;
    missingInShopify: number;
  };
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-blue-100 text-blue-600',
};

const ISSUE_LABELS: Record<string, string> = {
  PRICE_MISMATCH: 'Price mismatch',
  INVENTORY_MISMATCH: 'Inventory mismatch',
  STATUS_MISMATCH: 'Status mismatch',
  MISSING_IN_SHOPIFY: 'Missing in Shopify',
  VARIANT_MISMATCH: 'Variant mismatch',
};

export default function ShopifyReconciliationPage() {
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('connectionId'));
  const [result, setResult] = useState<ReconciliationResult | null>(null);

  const { data: connectionsData } = useQuery<{ data: ShopifyConnection[] }>({
    queryKey: ['shopify-connections'],
    queryFn: async () => {
      const res = await api().get('/integrations/connections');
      const all = (res.data as any)?.data ?? res.data ?? [];
      const shopify = Array.isArray(all) ? all.filter((c: any) => c.provider === 'shopify') : [];
      return { data: shopify };
    },
  });

  const connections = connectionsData?.data ?? [];
  const connectionId = selectedId ?? connections[0]?.id ?? null;

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post(`/shopify/connections/${connectionId}/reconcile`);
      return (res.data as any)?.data ?? res.data;
    },
    onSuccess: (data) => {
      setResult(data as ReconciliationResult);
    },
  });

  const totalDiscrepancies = result?.discrepancies?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/integrations/shopify" className="text-gray-400 hover:text-gray-600 text-sm">Shopify</Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-700">Reconciliation</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reconciliation</h1>
          <p className="text-gray-500 text-sm mt-1">
            Detect discrepancies between KNEF and Shopify (read-only — no auto-fix)
          </p>
        </div>
        <button
          onClick={() => reconcileMutation.mutate()}
          disabled={!connectionId || reconcileMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={cn(reconcileMutation.isPending && 'animate-spin')} />
          {reconcileMutation.isPending ? 'Running…' : 'Run Reconciliation'}
        </button>
      </div>

      {/* Connection selector */}
      {connections.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Store:</span>
          <select
            value={connectionId ?? ''}
            onChange={e => setSelectedId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {connections.map(c => (
              <option key={c.id} value={c.id}>{c.displayName ?? c.externalAccountName ?? c.id}</option>
            ))}
          </select>
        </div>
      )}

      {!connectionId ? (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <BarChart2 size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No Shopify connection. <Link href="/integrations/connections" className="text-blue-600 underline">Connect now</Link></p>
        </div>
      ) : !result ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-10 text-center">
          <BarChart2 size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium">No reconciliation run yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Click "Run Reconciliation" to compare KNEF vs. Shopify
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
            <Info size={13} />
            This is a read-only scan — it will NOT auto-fix any discrepancies
          </div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{result.totalChecked}</p>
              <p className="text-xs text-gray-500">Products Checked</p>
            </div>
            <div className={cn('rounded-xl border p-4 text-center', totalDiscrepancies === 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
              <p className={cn('text-2xl font-bold', totalDiscrepancies === 0 ? 'text-green-700' : 'text-red-700')}>{totalDiscrepancies}</p>
              <p className={cn('text-xs', totalDiscrepancies === 0 ? 'text-green-600' : 'text-red-600')}>Total Discrepancies</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{result.summary?.priceMismatch ?? 0}</p>
              <p className="text-xs text-gray-500">Price Mismatches</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{result.summary?.inventoryMismatch ?? 0}</p>
              <p className="text-xs text-gray-500">Inventory Mismatches</p>
            </div>
          </div>

          {/* Run info */}
          {result.runAt && (
            <p className="text-xs text-gray-400">
              Last run: {new Date(result.runAt).toLocaleString()}
            </p>
          )}

          {/* Discrepancies table */}
          {totalDiscrepancies === 0 ? (
            <div className="bg-green-50 rounded-xl border border-green-200 p-6 flex items-center gap-3">
              <CheckCircle2 size={20} className="text-green-600 shrink-0" />
              <div>
                <p className="font-medium text-green-800">All in sync</p>
                <p className="text-sm text-green-700">No discrepancies found between KNEF and Shopify.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-gray-900">Discrepancies Found</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-700 text-xs">Product</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-700 text-xs">SKU</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-700 text-xs">Issue</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-700 text-xs">KNEF Value</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-700 text-xs">Shopify Value</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-700 text-xs">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.discrepancies.map((d, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900 truncate max-w-[160px]">{d.productName}</td>
                        <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{d.sku}</td>
                        <td className="px-4 py-2.5 text-gray-600">{ISSUE_LABELS[d.issueType] ?? d.issueType}</td>
                        <td className="px-4 py-2.5 text-right text-gray-900">{d.knefValue}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{d.shopifyValue}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', SEVERITY_COLORS[d.severity] ?? 'bg-gray-100 text-gray-500')}>
                            {d.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 bg-blue-50 flex items-center gap-2 text-xs text-blue-700">
                <Info size={12} />
                KNEF is the source of truth for products, prices, and inventory. Resolve discrepancies by triggering a sync from the Products page.
              </div>
            </div>
          )}

          {reconcileMutation.isError && (
            <p className="text-sm text-red-600">Reconciliation failed. Please try again.</p>
          )}
        </>
      )}
    </div>
  );
}
