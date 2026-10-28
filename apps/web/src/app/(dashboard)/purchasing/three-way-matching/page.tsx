'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, CheckCircle2, XCircle, AlertTriangle, GitMerge } from 'lucide-react';
import { api } from '@/lib/api';

const fmt = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG')}`;

export default function ThreeWayMatchingPage() {
  const [selectedPoId, setSelectedPoId] = useState('');
  const [poSearch, setPoSearch] = useState('');
  const [runMatchId, setRunMatchId] = useState('');

  const { data: poData, isLoading: poLoading } = useQuery({
    queryKey: ['po-list-for-match'],
    queryFn: async () => {
      const res = await api().get<any>('/purchasing/orders?page=1&limit=50&status=RECEIVED');
      return res.data;
    },
  });

  const receivedOrders: any[] = (poData?.data ?? []).filter(
    (o: any) => o.status === 'RECEIVED',
  );

  const filteredOrders = receivedOrders.filter((o: any) => {
    const q = poSearch.toLowerCase();
    return (
      !q ||
      o.reference.toLowerCase().includes(q) ||
      o.supplier?.name?.toLowerCase().includes(q)
    );
  });

  const {
    data: matchData,
    isLoading: matchLoading,
    isError: matchError,
    refetch,
  } = useQuery({
    queryKey: ['three-way-match', runMatchId],
    queryFn: async () => {
      const res = await api().get<any>(`/purchasing/${runMatchId}/three-way-match`);
      return res.data;
    },
    enabled: !!runMatchId,
  });

  const selectedPo = receivedOrders.find((o: any) => o.id === selectedPoId);

  const handleRunMatch = () => {
    if (selectedPoId) setRunMatchId(selectedPoId);
  };

  const match = matchData?.match;
  const lines: any[] = matchData?.lines ?? [];
  const invoice = matchData?.invoiceSummary;
  const po = matchData?.purchaseOrder;

  const allClear = match && !match.requiresReview;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Three-Way Matching</h1>
        <p className="text-gray-500 text-sm mt-1">
          Verify PO, Goods Receipt, and Invoice quantities and values align
        </p>
      </div>

      {/* PO selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Select Purchase Order
        </h2>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Filter by reference or supplier..."
            value={poSearch}
            onChange={(e) => setPoSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {poLoading ? (
          <div className="h-8 bg-gray-100 rounded animate-pulse" />
        ) : (
          <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
            {filteredOrders.length === 0 && (
              <p className="px-4 py-4 text-sm text-gray-400 text-center">
                No received purchase orders found.
              </p>
            )}
            {filteredOrders.map((o: any) => (
              <button
                key={o.id}
                onClick={() => setSelectedPoId(o.id)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 transition-colors ${
                  selectedPoId === o.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                }`}
              >
                <span className="font-mono text-xs text-gray-700">{o.reference}</span>
                <span className="text-gray-500">{o.supplier?.name}</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  {o.status}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          {selectedPo && (
            <p className="text-sm text-gray-600 flex-1">
              Selected: <span className="font-semibold text-gray-900">{selectedPo.reference}</span>{' '}
              &mdash; {selectedPo.supplier?.name}
            </p>
          )}
          <button
            onClick={handleRunMatch}
            disabled={!selectedPoId || matchLoading}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <GitMerge size={15} />
            {matchLoading ? 'Matching...' : 'Run Match'}
          </button>
        </div>
      </div>

      {/* Results */}
      {runMatchId && !matchLoading && matchData && (
        <div className="space-y-5">
          {/* Overall status banner */}
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${
              allClear
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {allClear ? (
              <CheckCircle2 size={22} className="shrink-0" />
            ) : (
              <AlertTriangle size={22} className="shrink-0" />
            )}
            <div>
              <p className="font-semibold text-base">
                {allClear ? 'All Clear — Three-way match passed' : 'Requires Review — Discrepancies found'}
              </p>
              <p className="text-sm opacity-80">
                {match.quantityMatch ? 'Quantities match.' : 'Quantity variance detected.'}{' '}
                {match.valueMatchWithin5Pct
                  ? 'Value within 5% tolerance.'
                  : `Value variance: ${fmt(Math.abs(match.valueVariance))}`}
              </p>
            </div>
          </div>

          {/* PO info */}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Purchase Order</p>
            <p className="text-lg font-bold text-gray-900">{po?.reference}</p>
            <p className="text-sm text-gray-500">{po?.supplier?.name}</p>
          </div>

          {/* Lines table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800 text-sm">Line-Level Matching</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Product</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">SKU</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-700">PO Qty</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-700">GRN Qty</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-700">Variance</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-700">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line: any) => (
                    <tr key={line.productId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{line.productName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{line.sku}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{line.poQty}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{line.grnQty}</td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          line.qtyVariance === 0 ? 'text-gray-400' : 'text-red-600'
                        }`}
                      >
                        {line.qtyVariance > 0 ? '+' : ''}{line.qtyVariance}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {line.qtyMatch ? (
                          <CheckCircle2 size={18} className="mx-auto text-emerald-500" />
                        ) : (
                          <XCircle size={18} className="mx-auto text-red-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        No line items found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Invoice summary */}
          {invoice && (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">Invoice Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Total Invoiced</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(invoice.totalInvoiced)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Invoice Count</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{invoice.invoiceCount}</p>
                </div>
                {match && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Value Variance</p>
                    <p
                      className={`text-lg font-bold mt-0.5 ${
                        match.valueVariance === 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {match.valueVariance === 0 ? 'None' : fmt(Math.abs(match.valueVariance))}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {matchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-700 text-sm">
          Failed to load three-way match data. Please try again.
        </div>
      )}
    </div>
  );
}
