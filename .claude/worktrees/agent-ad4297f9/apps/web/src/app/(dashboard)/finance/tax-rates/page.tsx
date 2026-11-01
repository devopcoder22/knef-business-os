'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Star, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TaxRate {
  id: string;
  name: string;
  code: string;
  rate: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export default function TaxRatesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', rate: '', description: '', isDefault: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: taxRates = [], isLoading } = useQuery<TaxRate[]>({
    queryKey: ['tax-rates'],
    queryFn: async () => {
      const res = await api().get<TaxRate[]>('/tax-rates');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api().post('/tax-rates', form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-rates'] });
      setShowCreate(false);
      setForm({ name: '', code: '', rate: '', description: '', isDefault: false });
      setErrors({});
    },
    onError: (err: { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message ?? 'Failed to create tax rate';
      setErrors({ submit: Array.isArray(msg) ? msg.join(', ') : msg });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().post(`/tax-rates/${id}/set-default`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tax-rates'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().delete(`/tax-rates/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tax-rates'] }),
  });

  const handleCreate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs['name'] = 'Name required';
    if (!form.code.trim()) errs['code'] = 'Code required';
    if (!form.rate || isNaN(Number(form.rate))) errs['rate'] = 'Valid rate required';
    setErrors(errs);
    if (Object.keys(errs).length === 0) createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tax Rates</h1>
          <p className="text-gray-500 text-sm mt-1">Configure tax rates for sales and expenses</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Tax Rate
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Code</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">Rate</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Description</th>
              <th className="text-center px-4 py-3 font-medium text-gray-700">Default</th>
              <th className="text-center px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              : taxRates.map((rate) => (
                  <tr key={rate.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{rate.name}</td>
                    <td className="px-4 py-3 font-mono text-xs bg-gray-50 text-gray-700">{rate.code}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{rate.rate}%</td>
                    <td className="px-4 py-3 text-gray-500">{rate.description ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {rate.isDefault ? (
                        <Star size={16} className="mx-auto text-amber-400 fill-amber-400" />
                      ) : (
                        <button
                          onClick={() => setDefaultMutation.mutate(rate.id)}
                          className="mx-auto block text-gray-300 hover:text-amber-400"
                          title="Set as default"
                        >
                          <Star size={16} />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', rate.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {rate.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { if (confirm('Delete this tax rate?')) deleteMutation.mutate(rate.id); }}
                        className="p-1 text-gray-400 hover:text-red-500 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
            {!isLoading && taxRates.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">No tax rates configured</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">New Tax Rate</h2>
            <div className="space-y-3">
              {[
                { label: 'Name', key: 'name', placeholder: 'e.g. VAT' },
                { label: 'Code', key: 'code', placeholder: 'e.g. VAT7.5' },
                { label: 'Rate (%)', key: 'rate', placeholder: '7.50' },
                { label: 'Description (optional)', key: 'description', placeholder: 'Value Added Tax' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type={key === 'rate' ? 'number' : 'text'}
                    step={key === 'rate' ? '0.01' : undefined}
                    value={form[key as keyof typeof form] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={cn('w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500', errors[key] ? 'border-red-300' : 'border-gray-200')}
                  />
                  {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
                Set as default
              </label>
            </div>
            {errors.submit && <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{errors.submit}</div>}
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700">Cancel</button>
              <button onClick={handleCreate} disabled={createMutation.isPending} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
