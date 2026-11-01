'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, ChevronDown, Folder, FolderOpen, Trash2, Edit2, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  children: Category[];
}

function CategoryRow({
  category,
  depth = 0,
  onEdit,
  onDelete,
}: {
  category: Category;
  depth?: number;
  onEdit: (cat: Category) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = category.children.length > 0;

  return (
    <>
      <div
        className="flex items-center group py-2 hover:bg-gray-50 rounded-lg px-2 transition-colors"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn('mr-1 text-gray-400', !hasChildren && 'invisible')}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {hasChildren ? (
          expanded ? (
            <FolderOpen size={16} className="text-amber-500 mr-2 flex-shrink-0" />
          ) : (
            <Folder size={16} className="text-amber-500 mr-2 flex-shrink-0" />
          )
        ) : (
          <Folder size={16} className="text-gray-300 mr-2 flex-shrink-0" />
        )}
        <span className="text-sm text-gray-800 flex-1">{category.name}</span>
        <span className="text-xs text-gray-400 font-mono mr-4 hidden sm:block">{category.slug}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(category)}
            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={() => onDelete(category.id, category.name)}
            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {expanded &&
        category.children.map((child) => (
          <CategoryRow
            key={child.id}
            category={child}
            depth={depth + 1}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', parentId: '', description: '' });
  const [error, setError] = useState('');

  const { data: treeData, isLoading } = useQuery<Category[]>({
    queryKey: ['categories-tree'],
    queryFn: async () => {
      const res = await api().get<Category[]>('/categories');
      return (res.data as any);
    },
  });

  const { data: flatData } = useQuery<{ data: Category[] }>({
    queryKey: ['categories-flat'],
    queryFn: async () => {
      const res = await api().get<{ data: Category[] }>('/categories/flat');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api().post('/categories', {
        name: form.name,
        parentId: form.parentId || undefined,
        description: form.description || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-tree'] });
      queryClient.invalidateQueries({ queryKey: ['categories-flat'] });
      setShowCreate(false);
      setForm({ name: '', parentId: '', description: '' });
      setError('');
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'Failed to create category');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await api().patch(`/categories/${editingCategory!.id}`, {
        name: form.name,
        parentId: form.parentId || undefined,
        description: form.description || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-tree'] });
      queryClient.invalidateQueries({ queryKey: ['categories-flat'] });
      setEditingCategory(null);
      setForm({ name: '', parentId: '', description: '' });
      setError('');
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'Failed to update category');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().delete(`/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-tree'] });
      queryClient.invalidateQueries({ queryKey: ['categories-flat'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message ?? 'Failed to delete category');
    },
  });

  const handleEdit = (cat: Category) => {
    setEditingCategory(cat);
    setForm({ name: cat.name, parentId: cat.parentId ?? '', description: cat.description ?? '' });
    setError('');
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete category "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate(id);
    }
  };

  const categories = treeData ?? [];
  const flatCategories = flatData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-gray-500 text-sm mt-1">Organize products into categories</p>
        </div>
        <button
          onClick={() => {
            setShowCreate(true);
            setEditingCategory(null);
            setForm({ name: '', parentId: '', description: '' });
            setError('');
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Category
        </button>
      </div>

      {/* Create/Edit form */}
      {(showCreate || editingCategory) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">
            {editingCategory ? `Edit "${editingCategory.name}"` : 'New Category'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Smartphones"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
              <select
                value={form.parentId}
                onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No parent (top-level)</option>
                {flatCategories
                  .filter((c) => c.id !== editingCategory?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (!form.name.trim()) { setError('Name is required'); return; }
                setError('');
                editingCategory ? updateMutation.mutate() : createMutation.mutate();
              }}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <Check size={14} />
              {editingCategory ? 'Update' : 'Create'}
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setEditingCategory(null);
                setError('');
              }}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category tree */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Folder size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No categories yet. Create your first one.</p>
          </div>
        ) : (
          categories.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
