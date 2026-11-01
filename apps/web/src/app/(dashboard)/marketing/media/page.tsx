'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, Trash2, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MediaAsset {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  altText: string | null;
  tags: string[];
  category: string;
  createdAt: string;
}

const CATEGORIES = ['CAMPAIGN_IMAGE', 'PRODUCT_IMAGE', 'VIDEO', 'LOGO', 'DOCUMENT'];

const CATEGORY_COLORS: Record<string, string> = {
  CAMPAIGN_IMAGE: 'bg-blue-100 text-blue-700',
  PRODUCT_IMAGE: 'bg-green-100 text-green-700',
  VIDEO: 'bg-purple-100 text-purple-700',
  LOGO: 'bg-orange-100 text-orange-700',
  DOCUMENT: 'bg-gray-100 text-gray-600',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MediaLibraryPage() {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newAsset, setNewAsset] = useState({
    filename: '', originalName: '', mimeType: 'image/jpeg', url: '', altText: '', category: 'CAMPAIGN_IMAGE',
  });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ items: MediaAsset[]; total: number }>({
    queryKey: ['marketing-media', categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '48' });
      if (categoryFilter) params.set('category', categoryFilter);
      const res = await api().get<{ items: MediaAsset[]; total: number }>(
        `/marketing/media?${params}`,
      );
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api().post('/marketing/media', { ...newAsset, size: 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-media'] });
      setShowRegisterForm(false);
      setNewAsset({ filename: '', originalName: '', mimeType: 'image/jpeg', url: '', altText: '', category: 'CAMPAIGN_IMAGE' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api().delete(`/marketing/media/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-media'] }),
  });

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
          <p className="text-gray-500 text-sm mt-0.5">{data?.total ?? 0} assets</p>
        </div>
        <button
          onClick={() => setShowRegisterForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          Register Asset
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        The media library registers URLs of already-uploaded files. Use the Uploads endpoint to upload files, then register them here with metadata.
      </div>

      {showRegisterForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm">Register Media Asset</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">URL *</label>
              <input value={newAsset.url} onChange={(e) => setNewAsset({ ...newAsset, url: e.target.value })}
                placeholder="https://..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Filename *</label>
              <input value={newAsset.filename} onChange={(e) => setNewAsset({ ...newAsset, filename: e.target.value, originalName: e.target.value })}
                placeholder="image.jpg" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={newAsset.category} onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Alt Text</label>
              <input value={newAsset.altText} onChange={(e) => setNewAsset({ ...newAsset, altText: e.target.value })}
                placeholder="Describe the image..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => createMutation.mutate()} disabled={!newAsset.url || !newAsset.filename || createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setShowRegisterForm(false)} className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setCategoryFilter('')}
          className={cn('px-3 py-1.5 text-xs rounded-full font-medium border', !categoryFilter ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
            className={cn('px-3 py-1.5 text-xs rounded-full font-medium border', categoryFilter === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
            {cat.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading media...</div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
          <Image size={32} className="text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">No media assets found</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {(data?.items ?? []).map((asset) => (
            <div key={asset.id} className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden">
              {isImage(asset.mimeType) ? (
                <img src={asset.url} alt={asset.altText ?? asset.originalName}
                  className="w-full aspect-square object-cover" />
              ) : (
                <div className="w-full aspect-square flex items-center justify-center bg-gray-50">
                  <Image size={24} className="text-gray-300" />
                </div>
              )}

              <div className="p-2">
                <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', CATEGORY_COLORS[asset.category] ?? 'bg-gray-100 text-gray-600')}>
                  {asset.category.replace(/_/g, ' ')}
                </span>
                <p className="text-xs text-gray-600 truncate mt-1">{asset.originalName}</p>
                {asset.size > 0 && <p className="text-xs text-gray-400">{formatBytes(asset.size)}</p>}
              </div>

              <button
                onClick={() => deleteMutation.mutate(asset.id)}
                className="absolute top-1.5 right-1.5 p-1 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
