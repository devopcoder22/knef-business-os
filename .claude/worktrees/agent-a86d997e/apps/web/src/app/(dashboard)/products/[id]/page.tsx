'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Edit,
  Package,
  Tag,
  BarChart3,
  Image as ImageIcon,
  Layers,
  Activity,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Package },
  { id: 'variants', label: 'Variants', icon: Layers },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'inventory', label: 'Inventory', icon: BarChart3 },
  { id: 'activity', label: 'Activity', icon: Activity },
] as const;

type TabId = (typeof TABS)[number]['id'];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-gray-100 text-gray-600',
  DISCONTINUED: 'bg-red-100 text-red-700',
  DRAFT: 'bg-yellow-100 text-yellow-700',
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const productId = params.id as string;

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const res = await api().get(`/products/${productId}`);
      return (res.data as any);
    },
  });

  const { data: movements } = useQuery({
    queryKey: ['product-movements', productId],
    queryFn: async () => {
      const res = await api().get(`/inventory/${productId}/movements?limit=20`);
      return (res.data as any);
    },
    enabled: activeTab === 'activity',
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-100 rounded animate-pulse w-48" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-20">
        <Package size={40} className="mx-auto mb-3 text-gray-300" />
        <p className="text-gray-500">Product not found</p>
        <button
          onClick={() => router.push('/products')}
          className="mt-4 text-blue-600 text-sm hover:underline"
        >
          Back to products
        </button>
      </div>
    );
  }

  const totalStock = (product.inventoryLevels ?? []).reduce(
    (sum: number, l: any) => sum + l.quantity,
    0,
  );
  const isLowStock = totalStock <= product.lowStockAlert;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/products')}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
              <span
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-xs font-medium',
                  STATUS_COLORS[product.status] ?? 'bg-gray-100 text-gray-600',
                )}
              >
                {product.status}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1 font-mono">SKU: {product.sku}</p>
          </div>
        </div>
        <Link
          href={`/products/${productId}/edit`}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Edit size={16} />
          Edit
        </Link>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            if (tab.id === 'variants' && !product.hasVariants) return null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors',
                  activeTab === tab.id
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Category</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {product.category?.name ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Brand</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {product.brand?.name ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Cost Price</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {Number(product.costPrice).toLocaleString('en-NG', {
                        style: 'currency',
                        currency: 'NGN',
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Selling Price</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {Number(product.sellingPrice).toLocaleString('en-NG', {
                        style: 'currency',
                        currency: 'NGN',
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Barcode</p>
                    <p className="text-sm font-medium text-gray-900 mt-1 font-mono">
                      {product.barcode ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Stock</p>
                    <p
                      className={cn(
                        'text-sm font-medium mt-1',
                        totalStock === 0
                          ? 'text-red-600'
                          : isLowStock
                          ? 'text-amber-600'
                          : 'text-gray-900',
                      )}
                    >
                      {totalStock} units
                      {isLowStock && totalStock > 0 && (
                        <AlertTriangle size={12} className="inline ml-1 text-amber-500" />
                      )}
                    </p>
                  </div>
                </div>

                {product.description && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Description</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{product.description}</p>
                  </div>
                )}

                {/* Flags */}
                <div className="flex flex-wrap gap-2">
                  {product.isSerialized && (
                    <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                      Serialized
                    </span>
                  )}
                  {product.hasVariants && (
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      Has Variants
                    </span>
                  )}
                  {product.trackInventory && (
                    <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      Inventory Tracked
                    </span>
                  )}
                </div>
              </div>

              {/* Primary image */}
              <div>
                {product.images?.[0] ? (
                  <img
                    src={product.images[0].url}
                    alt={product.name}
                    className="w-full aspect-square object-cover rounded-xl border border-gray-200"
                  />
                ) : (
                  <div className="w-full aspect-square bg-gray-100 rounded-xl flex items-center justify-center">
                    <Package size={48} className="text-gray-300" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Variants */}
          {activeTab === 'variants' && (
            <div>
              {product.variants?.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No variants yet</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 font-medium text-gray-700">Name</th>
                      <th className="text-left py-2 font-medium text-gray-700">SKU</th>
                      <th className="text-right py-2 font-medium text-gray-700">Cost</th>
                      <th className="text-right py-2 font-medium text-gray-700">Price</th>
                      <th className="text-left py-2 font-medium text-gray-700">Options</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants?.map((v: any) => (
                      <tr key={v.id} className="border-b border-gray-100">
                        <td className="py-3">{v.name}</td>
                        <td className="py-3 font-mono text-xs text-gray-600">{v.sku}</td>
                        <td className="py-3 text-right">
                          {Number(v.costPrice).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                        </td>
                        <td className="py-3 text-right">
                          {Number(v.sellingPrice).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                        </td>
                        <td className="py-3 text-gray-600 text-xs">
                          {Object.entries(v.options ?? {})
                            .map(([k, val]) => `${k}: ${val}`)
                            .join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Images */}
          {activeTab === 'images' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {product.images?.length === 0 && (
                <p className="text-sm text-gray-500 col-span-4 text-center py-6">No images</p>
              )}
              {product.images?.map((img: any) => (
                <div key={img.id} className="relative">
                  <img
                    src={img.url}
                    alt={img.altText ?? product.name}
                    className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                  />
                  {img.isPrimary && (
                    <span className="absolute top-1 left-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">
                      Primary
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Inventory */}
          {activeTab === 'inventory' && (
            <div>
              {product.inventoryLevels?.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No inventory levels found</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 font-medium text-gray-700">Location</th>
                      <th className="text-right py-2 font-medium text-gray-700">Available</th>
                      <th className="text-right py-2 font-medium text-gray-700">Reserved</th>
                      <th className="text-right py-2 font-medium text-gray-700">Incoming</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.inventoryLevels?.map((level: any) => (
                      <tr key={level.id} className="border-b border-gray-100">
                        <td className="py-3">
                          {level.location?.name}{' '}
                          <span className="text-xs text-gray-400">({level.location?.code})</span>
                        </td>
                        <td className="py-3 text-right font-medium">
                          {level.quantity - level.reserved}
                        </td>
                        <td className="py-3 text-right text-amber-600">{level.reserved}</td>
                        <td className="py-3 text-right text-blue-600">{level.incoming}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50">
                      <td className="py-2 px-0 font-medium text-gray-700">Total</td>
                      <td className="py-2 text-right font-bold text-gray-900">{totalStock}</td>
                      <td className="py-2 text-right font-bold text-amber-600">
                        {product.inventoryLevels?.reduce((s: number, l: any) => s + l.reserved, 0)}
                      </td>
                      <td className="py-2 text-right font-bold text-blue-600">
                        {product.inventoryLevels?.reduce((s: number, l: any) => s + l.incoming, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Activity */}
          {activeTab === 'activity' && (
            <div>
              {!movements || movements.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No movements recorded</p>
              ) : (
                <div className="space-y-2">
                  {movements.map((m: any) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-2 border-b border-gray-100"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-700">{m.type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(m.createdAt).toLocaleDateString('en-NG', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {m.notes && ` · ${m.notes}`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'text-sm font-bold',
                          m.quantity > 0 ? 'text-green-600' : 'text-red-600',
                        )}
                      >
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
