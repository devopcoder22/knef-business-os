'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, RefreshCw, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type ImportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
type MatchStatus = 'UNMATCHED' | 'AUTO_MATCHED' | 'MANUALLY_MATCHED' | 'CONFIRMED' | 'EXCLUDED';

interface BankAccount {
  id: string;
  name: string;
  balance: string;
}

interface ImportSession {
  id: string;
  fileName: string;
  status: ImportStatus;
  createdAt: string;
  _count: { transactions: number };
}

interface ReconciliationTxn {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  matchStatus: MatchStatus;
  matchedTxnId: string | null;
}

const STATUS_BADGE: Record<ImportStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETE: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const MATCH_BADGE: Record<MatchStatus, string> = {
  UNMATCHED: 'bg-yellow-100 text-yellow-700',
  AUTO_MATCHED: 'bg-blue-100 text-blue-700',
  MANUALLY_MATCHED: 'bg-purple-100 text-purple-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  EXCLUDED: 'bg-gray-100 text-gray-500',
};

function fmtKobo(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(n / 100);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ReconciliationPage() {
  const queryClient = useQueryClient();

  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [page, setPage] = useState(1);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Bank accounts for selector
  const { data: accountsData } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const res = await api().get<{ data: BankAccount[] }>('/bank-accounts');
      return res.data.data;
    },
  });
  const accounts = accountsData ?? [];

  // Import sessions list
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['bank-reconciliation', selectedAccountId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (selectedAccountId) params.set('bankAccountId', selectedAccountId);
      const res = await api().get<{ data: ImportSession[]; meta: any }>(`/bank-reconciliation?${params}`);
      return res.data;
    },
    enabled: true,
  });
  const sessions = sessionsData?.data ?? [];
  const meta = sessionsData?.meta;

  // Transactions for selected import
  const { data: txnsData, isLoading: txnsLoading } = useQuery({
    queryKey: ['bank-reconciliation-txns', selectedImportId],
    queryFn: async () => {
      const res = await api().get<{ data: ReconciliationTxn[] }>(
        `/bank-reconciliation/${selectedImportId}/transactions`
      );
      return res.data.data;
    },
    enabled: !!selectedImportId,
  });
  const txns = txnsData ?? [];

  // Confirm match
  const confirmMutation = useMutation({
    mutationFn: async ({ txnId }: { txnId: string }) => {
      await api().post(`/bank-reconciliation/${selectedImportId}/transactions/${txnId}/confirm`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation-txns', selectedImportId] });
    },
  });

  // Exclude transaction
  const excludeMutation = useMutation({
    mutationFn: async ({ txnId }: { txnId: string }) => {
      await api().post(`/bank-reconciliation/${selectedImportId}/transactions/${txnId}/exclude`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation-txns', selectedImportId] });
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccountId) throw new Error('Select a bank account first');
      if (!csvText.trim()) throw new Error('Paste CSV content before importing');

      const lines = csvText.trim().split('\n').filter(Boolean);
      const rows = lines.map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length < 4) throw new Error(`Invalid line: "${line}"`);
        const [date, description, amountStr, type] = parts;
        const amount = parseFloat(amountStr);
        if (isNaN(amount)) throw new Error(`Invalid amount on line: "${line}"`);
        if (type !== 'CREDIT' && type !== 'DEBIT') throw new Error(`Type must be CREDIT or DEBIT on line: "${line}"`);
        return { date, description, amount, type: type as 'CREDIT' | 'DEBIT' };
      });

      await api().post('/bank-reconciliation/import', {
        bankAccountId: selectedAccountId,
        fileName: importFileName || `Manual Import ${new Date().toISOString().slice(0, 10)}`,
        fileType: 'CSV',
        rows,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation'] });
      setShowImport(false);
      setCsvText('');
      setImportFileName('');
      setImportError(null);
    },
    onError: (err: any) => {
      setImportError(err?.message ?? 'Import failed');
    },
  });

  function handleImport() {
    setImportError(null);
    importMutation.mutate();
  }

  const selectedSession = sessions.find((s) => s.id === selectedImportId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bank Reconciliation</h1>
          <p className="text-gray-500 text-sm mt-1">Import bank statements and match transactions</p>
        </div>
        <button
          onClick={() => {
            if (!selectedAccountId) {
              alert('Please select a bank account first');
              return;
            }
            setShowImport(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Upload size={16} />
          New Import
        </button>
      </div>

      {/* Account selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Bank Account</label>
        <select
          value={selectedAccountId}
          onChange={(e) => {
            setSelectedAccountId(e.target.value);
            setSelectedImportId(null);
            setPage(1);
          }}
          className="flex-1 max-w-xs border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* New Import panel */}
      {showImport && (
        <div className="bg-white rounded-xl border border-blue-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">New Manual Import</h2>
            <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-600 text-sm">
              Cancel
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File Name (optional)</label>
            <input
              type="text"
              value={importFileName}
              onChange={(e) => setImportFileName(e.target.value)}
              placeholder="e.g. Zenith October Statement"
              className="w-full max-w-md border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CSV Content
              <span className="text-gray-400 font-normal ml-2">— one row per line: date,description,amount,type</span>
            </label>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              placeholder={`2026-10-01,POS Sale,150000,CREDIT\n2026-10-02,Supplier Payment,500000,DEBIT\n2026-10-03,Transfer In,200000,CREDIT`}
              className="w-full font-mono border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
            <p className="text-xs text-gray-400 mt-1">
              Amount in kobo (e.g. 150000 = ₦1,500). Type must be <code>CREDIT</code> or <code>DEBIT</code>.
            </p>
          </div>

          {importError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {importError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={importMutation.isPending || !csvText.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {importMutation.isPending ? 'Importing...' : 'Import'}
            </button>
            <button
              onClick={() => {
                setShowImport(false);
                setImportError(null);
              }}
              className="px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Import Sessions table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Import Sessions</h2>
          {meta && (
            <span className="text-xs text-gray-400">
              Page {page} of {meta.totalPages ?? '?'}
            </span>
          )}
        </div>

        {sessionsLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            No import sessions yet. Click "New Import" to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="px-5 py-3 font-medium">File Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Transactions</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  onClick={() =>
                    setSelectedImportId(selectedImportId === session.id ? null : session.id)
                  }
                  className={cn(
                    'cursor-pointer hover:bg-gray-50 transition-colors',
                    selectedImportId === session.id && 'bg-blue-50'
                  )}
                >
                  <td className="px-5 py-3 font-medium text-gray-900">{session.fileName}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        STATUS_BADGE[session.status]
                      )}
                    >
                      {session.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">{session._count.transactions}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(session.createdAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <ChevronRight
                      size={14}
                      className={cn(
                        'text-gray-400 transition-transform',
                        selectedImportId === session.id && 'rotate-90 text-blue-500'
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3 justify-end">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= (meta.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Transactions panel for selected import */}
      {selectedImportId && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Transactions — {selectedSession?.fileName ?? selectedImportId}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{txns.length} rows</p>
            </div>
            <button
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ['bank-reconciliation-txns', selectedImportId] })
              }
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>

          {txnsLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : txns.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">No transactions in this import.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Match Status</th>
                    <th className="px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {txns.map((txn) => (
                    <tr key={txn.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">{txn.date}</td>
                      <td className="px-5 py-3 text-gray-900 max-w-xs truncate">{txn.description}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                        {fmtKobo(txn.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                            txn.type === 'CREDIT'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          )}
                        >
                          {txn.type}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                            MATCH_BADGE[txn.matchStatus]
                          )}
                        >
                          {txn.matchStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {txn.matchStatus === 'AUTO_MATCHED' && (
                          <button
                            onClick={() => confirmMutation.mutate({ txnId: txn.id })}
                            disabled={confirmMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle size={12} />
                            Confirm
                          </button>
                        )}
                        {txn.matchStatus === 'UNMATCHED' && (
                          <button
                            onClick={() => excludeMutation.mutate({ txnId: txn.id })}
                            disabled={excludeMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                          >
                            <XCircle size={12} />
                            Exclude
                          </button>
                        )}
                        {(txn.matchStatus === 'CONFIRMED' ||
                          txn.matchStatus === 'EXCLUDED' ||
                          txn.matchStatus === 'MANUALLY_MATCHED') && (
                          <span className="text-xs text-gray-400 italic">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
