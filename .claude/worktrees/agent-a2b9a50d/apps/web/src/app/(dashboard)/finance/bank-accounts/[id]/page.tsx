'use client';

import { useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, CheckCircle, Circle, TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  currency: string;
  balance: string;
  isDefault: boolean;
  isActive: boolean;
}

interface Transaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string;
  reference: string;
  category: string | null;
  date: string;
  reconciled: boolean;
}

interface TransactionsResponse {
  data: Transaction[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

function fmt(amount: string, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function BankAccountDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;

  const [page, setPage] = useState(1);
  const [showRecordTx, setShowRecordTx] = useState(false);
  const [txForm, setTxForm] = useState({
    type: 'CREDIT' as 'CREDIT' | 'DEBIT',
    amount: '',
    description: '',
    reference: '',
    category: '',
    date: new Date().toISOString().slice(0, 10),
  });

  const { data: account, isLoading: accountLoading } = useQuery<BankAccount>({
    queryKey: ['bank-account', id],
    queryFn: async () => {
      const res = await api().get<BankAccount>(`/bank-accounts/${id}`);
      return res.data;
    },
  });

  const { data: txData, isLoading: txLoading } = useQuery<TransactionsResponse>({
    queryKey: ['bank-transactions', id, page],
    queryFn: async () => {
      const res = await api().get<TransactionsResponse>(`/bank-accounts/${id}/transactions?page=${page}&limit=20`);
      return res.data;
    },
  });

  const recordTxMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/bank-accounts/${id}/transactions`, txForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions', id] });
      queryClient.invalidateQueries({ queryKey: ['bank-account', id] });
      setShowRecordTx(false);
      setTxForm({ type: 'CREDIT', amount: '', description: '', reference: '', category: '', date: new Date().toISOString().slice(0, 10) });
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: async (txId: string) => {
      await api().post(`/bank-accounts/${id}/reconcile/${txId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions', id] });
    },
  });

  if (accountLoading) {
    return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;
  }

  if (!account) return <div className="text-gray-500">Account not found</div>;

  const transactions = txData?.data ?? [];
  const meta = txData?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
          <p className="text-gray-500 text-sm">{account.bankName} · {account.accountNumber}</p>
        </div>
        <button
          onClick={() => setShowRecordTx(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          Record Transaction
        </button>
      </div>

      {/* Balance card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-500">Current Balance</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{fmt(account.balance, account.currency)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Account Name</p>
            <p className="font-medium text-gray-900 mt-1">{account.accountName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className={cn('mt-1 inline-flex px-2 py-0.5 rounded-full text-xs font-medium', account.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
              {account.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Transactions table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Transaction History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Description</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Amount</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Balance After</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700">Reconciled</th>
              </tr>
            </thead>
            <tbody>
              {txLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(tx.date).toLocaleDateString('en-NG')}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{tx.description}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{tx.reference}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={cn(
                            'flex items-center justify-end gap-1 font-medium',
                            tx.type === 'CREDIT' ? 'text-green-600' : 'text-red-600',
                          )}
                        >
                          {tx.type === 'CREDIT' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {tx.type === 'DEBIT' ? '-' : '+'}
                          {fmt(tx.amount, account.currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {fmt(tx.balanceAfter, account.currency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            if (!tx.reconciled) reconcileMutation.mutate(tx.id);
                          }}
                          disabled={tx.reconciled}
                          className="mx-auto flex items-center justify-center"
                        >
                          {tx.reconciled ? (
                            <CheckCircle size={16} className="text-green-500" />
                          ) : (
                            <Circle size={16} className="text-gray-300 hover:text-blue-400" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
              {!txLoading && transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    No transactions recorded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Previous</button>
              <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Record Transaction Modal */}
      {showRecordTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Record Transaction</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <div className="flex gap-2">
                  {(['CREDIT', 'DEBIT'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTxForm((f) => ({ ...f, type: t }))}
                      className={cn(
                        'flex-1 py-2 text-sm rounded-lg font-medium border transition-colors',
                        txForm.type === t
                          ? t === 'CREDIT'
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-red-600 text-white border-red-600'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {[
                { label: 'Amount (NGN)', key: 'amount', type: 'number', placeholder: '0.00' },
                { label: 'Description', key: 'description', type: 'text', placeholder: 'e.g. Customer payment' },
                { label: 'Reference (optional)', key: 'reference', type: 'text', placeholder: 'TXN-...' },
                { label: 'Category (optional)', key: 'category', type: 'text', placeholder: 'SALES' },
                { label: 'Date', key: 'date', type: 'date', placeholder: '' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type={type}
                    value={txForm[key as keyof typeof txForm] as string}
                    onChange={(e) => setTxForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowRecordTx(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700">Cancel</button>
              <button
                onClick={() => recordTxMutation.mutate()}
                disabled={recordTxMutation.isPending || !txForm.amount || !txForm.description}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {recordTxMutation.isPending ? 'Recording...' : 'Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BankAccountDetailPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-48 bg-gray-100 rounded-xl" />}>
      <BankAccountDetailContent />
    </Suspense>
  );
}
