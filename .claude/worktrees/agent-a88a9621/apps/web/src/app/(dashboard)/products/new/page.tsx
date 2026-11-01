'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'physical', label: 'Physical' },
  { id: 'variants', label: 'Variants' },
  { id: 'images', label: 'Images' },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface Category { id: string; name: string; parentId: string | null }
interface Brand { id: string; name: string }

interface VariantRow {
  name: string;
  sku: string;
  costPrice: string;
  sellingPrice: string;
  options: { key: string; value: string }[];
}

interface ImageRow {
  url: string;
  altText: string;
  isPrimary: boolean;
}

export default function NewProductPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('basic');

  // Form state
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [gtin, setGtin] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [description, setDescription] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [status, setStatus] = useState('ACTIVE');

  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [comparePrice, setComparePrice] = useState('');

  const [isSerialized, setIsSerialized] = useState(false);
  const [trackInventory, setTrackInventory] = useState(true);
  const [hasVariants, setHasVariants] = useState(false);
  const [lowStockAlert, setLowStockAlert] = useState('5');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');

  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: categoriesData } = useQuery<{ data: Category[] }>({
    queryKey: ['categories-flat'],
    queryFn: async () => {
      const res = await api().get<{ data: Category[] }>('/categories/flat');
      return res.data;
    },
  });

  const { data: brandsData } = useQuery<{ data: Brand[]; meta: object }>({
    queryKey: ['brands-list'],
    queryFn: async () => {
      const res = await api().get<{ data: Brand[]; meta: object }>('/brands?limit=100');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name,
        sku,
        barcode: barcode || undefined,
        gtin: gtin || undefined,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        description: description || undefined,
        shortDesc: shortDesc || undefined,
        costPrice,
        sellingPrice,
        comparePrice: comparePrice || undefined,
        isSerialized,
        hasVariants,
        trackInventory,
        lowStockAlert: parseInt(lowStockAlert, 10),
        weight: weight || undefined,
        weightUnit,
        status,
      };

      const res = await api().post<{ id: string }>('/products', payload);
      const productId = (res.data as any)?.id;

      // Add variants
      if (hasVariants && variants.length > 0 && productId) {
        for (const v of variants) {
          const opts: Record<string, string> = {};
          v.options.forEach((o) => { if (o.key) opts[o.key] = o.value; });
          await api().post(`/products/${productId}/variants`, {
            name: v.name,
            sku: v.sku,
            costPrice: v.costPrice,
            sellingPrice: v.sellingPrice,
            options: opts,
          });
        }
      }

      // Add images
      if (images.length > 0 && productId) {
        for (const img of images) {
          if (!img.url) continue;
          await api().post(`/products/${productId}/images`, {
            url: img.url,
            altText: img.altText || undefined,
            isPrimary: img.isPrimary,
          });
        }
      }

      return productId;
    },
    onSuccess: (productId) => {
      router.push(`/products/${productId}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Failed to create product';
      setErrors({ submit: Array.isArray(msg) ? msg.join(', ') : msg });
    },
  });

  const handleNameBlur = () => {
    if (!sku && name) {
      setSku(
        name
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 20),
      );
    }
  };

  const addVariant = () => {
    setVariants((prev) => [
      ...prev,
      { name: '', sku: '', costPrice: '', sellingPrice: '', options: [{ key: '', value: '' }] },
    ]);
  };

  const addImage = () => {
    setImages((prev) => [
      ...prev,
      { url: '', altText: '', isPrimary: prev.length === 0 },
    ]);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs['name'] = 'Name is required';
    if (!sku.trim()) errs['sku'] = 'SKU is required';
    if (!costPrice) errs['costPrice'] = 'Cost price is required';
    if (!sellingPrice) errs['sellingPrice'] = 'Selling price is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) createMutation.mutate();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Product</h1>
          <p className="text-gray-500 text-sm mt-1">Add a product to your catalog</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors',
                  activeTab === tab.id
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Basic Info */}
            {activeTab === 'basic' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={handleNameBlur}
                      placeholder="e.g. iPhone 15 Pro"
                      className={cn(
                        'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                        errors.name ? 'border-red-300' : 'border-gray-200',
                      )}
                    />
                    {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SKU <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value.toUpperCase())}
                      placeholder="e.g. IPH-15-PRO"
                      className={cn(
                        'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono',
                        errors.sku ? 'border-red-300' : 'border-gray-200',
                      )}
                    />
                    {errors.sku && <p className="text-xs text-red-500 mt-1">{errors.sku}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="EAN-13 or UPC-A"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      GTIN
                      <span className="ml-1 text-xs text-gray-400">(EAN-13 / UPC-A / GTIN-14)</span>
                    </label>
                    <input
                      type="text"
                      value={gtin}
                      onChange={(e) => setGtin(e.target.value)}
                      placeholder="e.g. 0123456789012"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="DRAFT">Draft</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="DISCONTINUED">Discontinued</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No category</option>
                      {categoriesData?.data?.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                    <select
                      value={brandId}
                      onChange={(e) => setBrandId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No brand</option>
                      {brandsData?.data?.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
                  <input
                    type="text"
                    value={shortDesc}
                    onChange={(e) => setShortDesc(e.target.value)}
                    placeholder="Brief product description"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Detailed product description..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>
            )}

            {/* Pricing */}
            {activeTab === 'pricing' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cost Price (NGN) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className={cn(
                        'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                        errors.costPrice ? 'border-red-300' : 'border-gray-200',
                      )}
                    />
                    {errors.costPrice && <p className="text-xs text-red-500 mt-1">{errors.costPrice}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Selling Price (NGN) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className={cn(
                        'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                        errors.sellingPrice ? 'border-red-300' : 'border-gray-200',
                      )}
                    />
                    {errors.sellingPrice && <p className="text-xs text-red-500 mt-1">{errors.sellingPrice}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Compare Price (NGN)
                    </label>
                    <input
                      type="number"
                      value={comparePrice}
                      onChange={(e) => setComparePrice(e.target.value)}
                      placeholder="Strike-through price"
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {costPrice && sellingPrice && (
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-blue-700">
                      Margin:{' '}
                      <strong>
                        {(
                          ((parseFloat(sellingPrice) - parseFloat(costPrice)) /
                            parseFloat(sellingPrice)) *
                          100
                        ).toFixed(1)}
                        %
                      </strong>{' '}
                      &bull; Markup:{' '}
                      <strong>
                        {(
                          ((parseFloat(sellingPrice) - parseFloat(costPrice)) /
                            parseFloat(costPrice)) *
                          100
                        ).toFixed(1)}
                        %
                      </strong>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Physical */}
            {activeTab === 'physical' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        placeholder="0.000"
                        min="0"
                        step="0.001"
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <select
                        value={weightUnit}
                        onChange={(e) => setWeightUnit(e.target.value)}
                        className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="lb">lb</option>
                        <option value="oz">oz</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Low Stock Alert Threshold
                    </label>
                    <input
                      type="number"
                      value={lowStockAlert}
                      onChange={(e) => setLowStockAlert(e.target.value)}
                      min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={trackInventory}
                      onChange={(e) => setTrackInventory(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Track Inventory</p>
                      <p className="text-xs text-gray-500">
                        Monitor stock levels and generate low-stock alerts
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSerialized}
                      onChange={(e) => setIsSerialized(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Serialized (IMEI/Serial tracked)</p>
                      <p className="text-xs text-gray-500">
                        Each unit is individually tracked by IMEI or serial number
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasVariants}
                      onChange={(e) => setHasVariants(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Has Variants</p>
                      <p className="text-xs text-gray-500">
                        Product has multiple versions (e.g. different colors, storage)
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Variants */}
            {activeTab === 'variants' && (
              <div className="space-y-4">
                {!hasVariants && (
                  <div className="bg-amber-50 rounded-lg p-4 text-sm text-amber-700">
                    Enable "Has Variants" in the Physical tab to add variants.
                  </div>
                )}
                {hasVariants && (
                  <>
                    {variants.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No variants added yet. Click "Add Variant" to start.
                      </p>
                    )}
                    {variants.map((variant, vi) => (
                      <div key={vi} className="border border-gray-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-gray-700">Variant {vi + 1}</h4>
                          <button
                            type="button"
                            onClick={() => setVariants((prev) => prev.filter((_, i) => i !== vi))}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="text"
                            placeholder="Variant name (e.g. 256GB Black)"
                            value={variant.name}
                            onChange={(e) =>
                              setVariants((prev) =>
                                prev.map((v, i) => (i === vi ? { ...v, name: e.target.value } : v)),
                              )
                            }
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            placeholder="SKU"
                            value={variant.sku}
                            onChange={(e) =>
                              setVariants((prev) =>
                                prev.map((v, i) =>
                                  i === vi ? { ...v, sku: e.target.value.toUpperCase() } : v,
                                ),
                              )
                            }
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                          />
                          <input
                            type="number"
                            placeholder="Cost price"
                            value={variant.costPrice}
                            onChange={(e) =>
                              setVariants((prev) =>
                                prev.map((v, i) => (i === vi ? { ...v, costPrice: e.target.value } : v)),
                              )
                            }
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="number"
                            placeholder="Selling price"
                            value={variant.sellingPrice}
                            onChange={(e) =>
                              setVariants((prev) =>
                                prev.map((v, i) =>
                                  i === vi ? { ...v, sellingPrice: e.target.value } : v,
                                ),
                              )
                            }
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-600">Attributes</p>
                          {variant.options.map((opt, oi) => (
                            <div key={oi} className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Key (e.g. color)"
                                value={opt.key}
                                onChange={(e) =>
                                  setVariants((prev) =>
                                    prev.map((v, i) =>
                                      i === vi
                                        ? {
                                            ...v,
                                            options: v.options.map((o, j) =>
                                              j === oi ? { ...o, key: e.target.value } : o,
                                            ),
                                          }
                                        : v,
                                    ),
                                  )
                                }
                                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <input
                                type="text"
                                placeholder="Value (e.g. Black)"
                                value={opt.value}
                                onChange={(e) =>
                                  setVariants((prev) =>
                                    prev.map((v, i) =>
                                      i === vi
                                        ? {
                                            ...v,
                                            options: v.options.map((o, j) =>
                                              j === oi ? { ...o, value: e.target.value } : o,
                                            ),
                                          }
                                        : v,
                                    ),
                                  )
                                }
                                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              setVariants((prev) =>
                                prev.map((v, i) =>
                                  i === vi
                                    ? { ...v, options: [...v.options, { key: '', value: '' }] }
                                    : v,
                                ),
                              )
                            }
                            className="text-xs text-blue-600 hover:underline"
                          >
                            + Add attribute
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addVariant}
                      className="flex items-center gap-2 px-4 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 w-full justify-center"
                    >
                      <Plus size={14} />
                      Add Variant
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Images */}
            {activeTab === 'images' && (
              <div className="space-y-4">
                {images.map((img, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            checked={img.isPrimary}
                            onChange={() =>
                              setImages((prev) =>
                                prev.map((im, j) => ({ ...im, isPrimary: j === i })),
                              )
                            }
                            className="text-blue-600"
                          />
                          <span className="text-xs text-gray-600">Primary</span>
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      type="url"
                      placeholder="Image URL (https://...)"
                      value={img.url}
                      onChange={(e) =>
                        setImages((prev) =>
                          prev.map((im, j) => (j === i ? { ...im, url: e.target.value } : im)),
                        )
                      }
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {img.url && (
                      <img
                        src={img.url}
                        alt="preview"
                        className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <input
                      type="text"
                      placeholder="Alt text (optional)"
                      value={img.altText}
                      onChange={(e) =>
                        setImages((prev) =>
                          prev.map((im, j) => (j === i ? { ...im, altText: e.target.value } : im)),
                        )
                      }
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addImage}
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 w-full justify-center"
                >
                  <Plus size={14} />
                  Add Image URL
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {errors.submit}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {createMutation.isPending ? 'Creating...' : 'Create Product'}
          </button>
        </div>
      </form>
    </div>
  );
}
