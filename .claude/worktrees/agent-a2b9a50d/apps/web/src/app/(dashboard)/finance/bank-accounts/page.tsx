'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Banknote, Eye, MoreHorizontal } from 'lucide-react';
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
  notes: string | null;
}

function fmt(amount: string, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export default function BankAccountsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
    bankCode: '',
    isDefault: false,
    notes: '',
  });

  const { data: accounts = [], isLoading } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const res = await api().get<BankAccount[]>('/bank-accounts');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api().post('/bank-accounts', form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      setShowCreate(false);
      setForm({ name: '', bankName: '', accountNumber: '', accountName: '', bankCode: '', isDefault: false, notes: '' });
    },
  });

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bank Accounts</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your organisation's bank accounts</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Account
        </button>
      </div>

      {/* Total balance card */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white">
        <p className="text-sm text-blue-200">Total Balance (All Accounts)</p>
        <p className="text-3xl font-bold mt-1">
          {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(totalBalance)}
        </p>
        <p className="text-sm text-blue-200 mt-2">{accounts.filter(a => a.isActive).length} active accounts</p>
      </div>

      {/* Accounts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-40 animate-pulse" />
            ))
          : accounts.map((account) => (
              <div
                key={account.id}
                className={cn(
                  'bg-white rounded-xl border p-5 flex flex-col gap-3',
                  account.isDefault ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-200',
                  !account.isActive && 'opacity-60',
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Banknote size={20} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{account.name}</p>
                      <p className="text-xs text-gray-500">{account.bankName}</p>
                    </div>
                  </div>
                  {account.isDefault && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                      Default
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Account No.</p>
                  <p className="font-mono text-sm text-gray-900">{account.accountNumber}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{account.accountName}</p>
                </div>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">Balance</p>
                    <p className="font-bold text-gray-900">{fmt(account.balance, account.currency)}</p>
                  </div>
                  <Link
                    href={`/finance/bank-accounts/${account.id}`}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <Eye size={12} />
                    View
                  </Link>
                </div>
              </div>
            ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Add Bank Account</h2>
            <div className="space-y-3">
              {[
                { label: 'Account Nickname', key: 'name', placeholder: 'e.g. Main Operating Account' },
                { label: 'Bank Name', key: 'bankName', placeholder: 'e.g. Zenith Bank' },
                { label: 'Account Number', key: 'accountNumber', placeholder: '0123456789' },
                { label: 'Account Name', key: 'accountName', placeholder: 'KNEF Gadgets Ltd' },
                { label: 'Bank Code (optional)', key: 'bankCode', placeholder: '057' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type="text"
                    value={form[key as keyof typeof form] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                  className="rounded"
                />
                Set as default account
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.name || !form.bankName || !form.accountNumber || !form.accountName}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
