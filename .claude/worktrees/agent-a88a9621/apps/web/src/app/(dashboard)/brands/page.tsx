'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag, Edit2, Trash2, Globe } from 'lucide-react';
import { api } from '@/lib/api';

interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  isActive: boolean;
  _count?: { products: number };
}

interface BrandsResponse {
  data: Brand[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

function BrandCard({
  brand,
  onEdit,
  onDelete,
}: {
  brand: Brand;
  onEdit: (b: Brand) => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 group hover:border-blue-200 transition-colors">
      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt={brand.name} className="w-12 h-12 object-contain" />
        ) : (
          <Tag size={20} className="text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">{brand.name}</p>
        <p className="text-xs text-gray-400 font-mono">{brand.slug}</p>
        {brand.website && (
          <a
            href={brand.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
          >
            <Globe size={10} />
            {brand.website.replace(/^https?:\/\//, '')}
          </a>
        )}
        <p className="text-xs text-gray-500 mt-1">
          {brand._count?.products ?? 0} product{(brand._count?.products ?? 0) !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(brand)}
          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => onDelete(brand.id, brand.name)}
          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function BrandsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name: '', logoUrl: '', website: '' });
  const [formError, setFormError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<BrandsResponse>({
    queryKey: ['brands', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '24' });
      if (search) params.set('search', search);
      const res = await api().get<BrandsResponse>(`/brands?${params}`);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api().post('/brands', {
        name: form.name,
        logoUrl: form.logoUrl || undefined,
        website: form.website || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      setShowForm(false);
      setForm({ name: '', logoUrl: '', website: '' });
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to create brand');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await api().patch(`/brands/${editingBrand!.id}`, {
        name: form.name,
        logoUrl: form.logoUrl || undefined,
        website: form.website || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      setEditingBrand(null);
      setShowForm(false);
      setForm({ name: '', logoUrl: '', website: '' });
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to update brand');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().delete(`/brands/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message ?? 'Failed to delete brand');
    },
  });

  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setForm({ name: brand.name, logoUrl: brand.logoUrl ?? '', website: brand.website ?? '' });
    setShowForm(true);
    setFormError('');
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete brand "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const brands = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brands</h1>
          <p className="text-gray-500 text-sm mt-1">Manage product brands</p>
        </div>
        <button
          onClick={() => {
            setEditingBrand(null);
            setForm({ name: '', logoUrl: '', website: '' });
            setShowForm(true);
            setFormError('');
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Brand
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">
            {editingBrand ? `Edit "${editingBrand.name}"` : 'New Brand'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Apple"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
              <input
                type="url"
                value={form.logoUrl}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (!form.name.trim()) { setFormError('Name is required'); return; }
                editingBrand ? updateMutation.mutate() : createMutation.mutate();
              }}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {editingBrand ? 'Update' : 'Create'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingBrand(null); }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-3">
        <input
          type="search"
          placeholder="Search brands..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 max-w-sm px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : brands.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <Tag size={32} className="mx-auto mb-2 opacity-50" />
          <p>No brands found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {brands.map((brand) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            disabled={page === meta.totalPages}
            className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
