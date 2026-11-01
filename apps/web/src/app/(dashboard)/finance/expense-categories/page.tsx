'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tag, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  parent?: { id: string; name: string } | null;
  _count?: { children: number };
}

const emptyForm = { name: '', description: '', parentId: '', isActive: true };

export default function ExpenseCategoriesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseCategory | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: categories = [], isLoading } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const res = await api().get('/expense-categories');
      const raw = (res.data as any)?.data ?? res.data;
      return Array.isArray(raw) ? raw : [];
    },
  });

  const topLevel = categories.filter(c => !c.parentId);
  const childrenOf = (parentId: string) => categories.filter(c => c.parentId === parentId);

  const createMutation = useMutation({
    mutationFn: async () => {
      await api().post('/expense-categories', {
        name: form.name,
        description: form.description || undefined,
        parentId: form.parentId || undefined,
        isActive: form.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setShowCreate(false);
      setForm(emptyForm);
      setErrors({});
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to create';
      setErrors({ submit: Array.isArray(msg) ? msg.join(', ') : msg });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      await api().patch(`/expense-categories/${editTarget.id}`, {
        name: form.name,
        description: form.description || undefined,
        parentId: form.parentId || undefined,
        isActive: form.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setEditTarget(null);
      setForm(emptyForm);
      setErrors({});
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to update';
      setErrors({ submit: Array.isArray(msg) ? msg.join(', ') : msg });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().delete(`/expense-categories/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expense-categories'] }),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setErrors({});
    setShowCreate(true);
  };

  const openEdit = (cat: ExpenseCategory) => {
    setForm({
      name: cat.name,
      description: cat.description ?? '',
      parentId: cat.parentId ?? '',
      isActive: cat.isActive,
    });
    setErrors({});
    setEditTarget(cat);
  };

  const handleSubmit = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs['name'] = 'Name is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (editTarget) updateMutation.mutate();
    else createMutation.mutate();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const showModal = showCreate || !!editTarget;

  const CategoryRow = ({ cat, depth = 0 }: { cat: ExpenseCategory; depth?: number }) => {
    const children = childrenOf(cat.id);
    return (
      <>
        <tr className="border-b border-gray-100 hover:bg-gray-50">
          <td className="px-4 py-3">
            <div className="flex items-center gap-2" style={{ paddingLeft: depth * 20 }}>
              {depth > 0 && <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />}
              <Tag size={14} className={cn('flex-shrink-0', depth === 0 ? 'text-blue-500' : 'text-gray-400')} />
              <span className={cn('font-medium', depth === 0 ? 'text-gray-900' : 'text-gray-700')}>{cat.name}</span>
            </div>
          </td>
          <td className="px-4 py-3 text-sm text-gray-500">{cat.description ?? '—'}</td>
          <td className="px-4 py-3 text-center">
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cat.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
              {cat.isActive ? 'Active' : 'Inactive'}
            </span>
          </td>
          <td className="px-4 py-3 text-center text-sm text-gray-500">{children.length > 0 ? children.length : '—'}</td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-1 justify-end">
              <button onClick={() => openEdit(cat)} className="p-1 text-gray-400 hover:text-blue-600 rounded" title="Edit">
                <Pencil size={14} />
              </button>
              <button
                onClick={() => { if (confirm(`Delete "${cat.name}"?`)) deleteMutation.mutate(cat.id); }}
                className="p-1 text-gray-400 hover:text-red-500 rounded"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </td>
        </tr>
        {children.map(child => <CategoryRow key={child.id} cat={child} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Categories</h1>
          <p className="text-gray-500 text-sm mt-1">Organise expenses into categories and sub-categories</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Category
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Description</th>
              <th className="text-center px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="text-center px-4 py-3 font-medium text-gray-700">Sub-categories</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              : topLevel.map(cat => <CategoryRow key={cat.id} cat={cat} />)}
            {!isLoading && categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-gray-400">
                  <Tag size={32} className="mx-auto mb-2 text-gray-200" />
                  <p className="font-medium">No expense categories yet</p>
                  <p className="text-xs mt-1">Create categories to organise your expenses</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {editTarget ? 'Edit Category' : 'New Expense Category'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Travel, Office Supplies"
                  className={cn('w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500', errors.name ? 'border-red-300' : 'border-gray-200')}
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
                <select
                  value={form.parentId}
                  onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— None (top-level) —</option>
                  {topLevel.filter(c => c.id !== editTarget?.id).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="rounded"
                />
                Active
              </label>
            </div>
            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{errors.submit}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCreate(false); setEditTarget(null); setErrors({}); }}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? 'Saving...' : editTarget ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
