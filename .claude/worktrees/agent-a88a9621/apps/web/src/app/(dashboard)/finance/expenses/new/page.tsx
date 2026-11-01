'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ExpenseCategory {
  id: string;
  name: string;
  isActive: boolean;
}

interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  isActive: boolean;
}

export default function NewExpensePage() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState('');
  const [vendor, setVendor] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const res = await api().get<ExpenseCategory[]>('/expense-categories');
      return res.data;
    },
  });

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const res = await api().get<BankAccount[]>('/bank-accounts');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post<{ id: string }>('/expenses', {
        description,
        amount,
        date,
        categoryId: categoryId || undefined,
        vendor: vendor || undefined,
        bankAccountId: bankAccountId || undefined,
        currency,
        notes: notes || undefined,
      });
      return (res.data as { id: string }).id;
    },
    onSuccess: () => router.push('/finance/expenses'),
    onError: (err: { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message ?? 'Failed to create expense';
      setErrors({ submit: Array.isArray(msg) ? msg.join(', ') : msg });
    },
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!description.trim()) errs['description'] = 'Description is required';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) errs['amount'] = 'Valid amount is required';
    if (!date) errs['date'] = 'Date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) createMutation.mutate();
  };

  const field = (label: string, required: boolean, child: React.ReactNode, error?: string) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {child}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );

  const inputCls = (hasErr: boolean) =>
    cn('w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500', hasErr ? 'border-red-300' : 'border-gray-200');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Expense</h1>
          <p className="text-gray-500 text-sm mt-1">Submit an expense for approval</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Expense Details</h2>
          {field('Description', true,
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className={inputCls(!!errors.description)} placeholder="e.g. Office supplies for December" />,
            errors.description
          )}
          <div className="grid grid-cols-2 gap-4">
            {field('Amount', true,
              <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls(!!errors.amount)} placeholder="0.00" />,
              errors.amount
            )}
            {field('Currency', false,
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls(false)}>
                <option value="NGN">NGN</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('Date', true,
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls(!!errors.date)} />,
              errors.date
            )}
            {field('Category', false,
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputCls(false)}>
                <option value="">No category</option>
                {categories.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          {field('Vendor', false,
            <input type="text" value={vendor} onChange={e => setVendor(e.target.value)} className={inputCls(false)} placeholder="e.g. Jumia, Local Market" />
          )}
          {field('Payment Account (optional)', false,
            <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className={inputCls(false)}>
              <option value="">Not specified</option>
              {bankAccounts.filter(a => a.isActive).map(a => (
                <option key={a.id} value={a.id}>{a.name} — {a.bankName}</option>
              ))}
            </select>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {field('Notes', false,
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Additional notes..." />
          )}
        </div>

        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errors.submit}</div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {createMutation.isPending ? 'Submitting...' : 'Submit Expense'}
          </button>
        </div>
      </form>
    </div>
  );
}
