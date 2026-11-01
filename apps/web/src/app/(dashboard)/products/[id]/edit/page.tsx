'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Upload, Trash2, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

const TABS = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'physical', label: 'Physical' },
  { id: 'images', label: 'Images' },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface Category { id: string; name: string }
interface Brand { id: string; name: string }

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const productId = params.id as string;
  const [activeTab, setActiveTab] = useState<TabId>('basic');

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
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
  const [lowStockAlert, setLowStockAlert] = useState('5');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const res = await api().get(`/products/${productId}`);
      return (res.data as any).data;
    },
  });

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

  // Pre-fill form when data loads
  useEffect(() => {
    if (product) {
      setName(product.name ?? '');
      setSku(product.sku ?? '');
      setBarcode(product.barcode ?? '');
      setCategoryId(product.categoryId ?? '');
      setBrandId(product.brandId ?? '');
      setDescription(product.description ?? '');
      setShortDesc(product.shortDesc ?? '');
      setStatus(product.status ?? 'ACTIVE');
      setCostPrice(String(product.costPrice ?? ''));
      setSellingPrice(String(product.sellingPrice ?? ''));
      setComparePrice(product.comparePrice ? String(product.comparePrice) : '');
      setIsSerialized(product.isSerialized ?? false);
      setTrackInventory(product.trackInventory ?? true);
      setLowStockAlert(String(product.lowStockAlert ?? 5));
      setWeight(product.weight ? String(product.weight) : '');
      setWeightUnit(product.weightUnit ?? 'kg');
    }
  }, [product]);

  const { data: imagesData, refetch: refetchImages } = useQuery({
    queryKey: ['product-images', productId],
    queryFn: async () => {
      const res = await api().get(`/products/${productId}/images`);
      return (res.data as any).data as { id: string; url: string; altText: string | null; isPrimary: boolean }[];
    },
  });
  const images = imagesData ?? [];

  const addImageMutation = useMutation({
    mutationFn: async (url: string) => {
      await api().post(`/products/${productId}/images`, { url, isPrimary: images.length === 0 });
    },
    onSuccess: () => { refetchImages(); setNewImageUrl(''); },
  });

  const deleteImageMutation = useMutation({
    mutationFn: async (imageId: string) => {
      await api().delete(`/products/${productId}/images/${imageId}`);
    },
    onSuccess: () => refetchImages(),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (imageId: string) => {
      await api().patch(`/products/${productId}/images/${imageId}`, { isPrimary: true });
    },
    onSuccess: () => refetchImages(),
  });

  const uploadImageFile = async (file: File) => {
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api().post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = (res.data as any).data.url as string;
      await api().post(`/products/${productId}/images`, { url, isPrimary: images.length === 0 });
      refetchImages();
    } catch {
      setErrors((prev) => ({ ...prev, submit: 'Image upload failed' }));
    } finally {
      setUploadingImage(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      await api().patch(`/products/${productId}`, {
        name,
        sku,
        barcode: barcode || undefined,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        description: description || undefined,
        shortDesc: shortDesc || undefined,
        costPrice,
        sellingPrice,
        comparePrice: comparePrice || undefined,
        isSerialized,
        trackInventory,
        lowStockAlert: parseInt(lowStockAlert, 10),
        weight: weight || undefined,
        weightUnit,
        status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      router.push(`/products/${productId}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to update product';
      setErrors({ submit: Array.isArray(msg) ? msg.join(', ') : msg });
    },
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs['name'] = 'Name is required';
    if (!sku.trim()) errs['sku'] = 'SKU is required';
    if (!costPrice) errs['costPrice'] = 'Cost price is required';
    if (!sellingPrice) errs['sellingPrice'] = 'Selling price is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-100 rounded animate-pulse w-48" />
        <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
          <p className="text-gray-500 text-sm mt-1">{product?.name}</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (validate()) updateMutation.mutate();
        }}
        className="space-y-6"
      >
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-200">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-5 py-3 text-sm font-medium transition-colors',
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
                      className={cn(
                        'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono',
                        errors.sku ? 'border-red-300' : 'border-gray-200',
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <RichTextEditor
                    value={shortDesc}
                    onChange={setShortDesc}
                    placeholder="Brief product description"
                    minHeight="min-h-[80px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <RichTextEditor
                    value={description}
                    onChange={setDescription}
                    placeholder="Detailed product description..."
                    minHeight="min-h-[150px]"
                  />
                </div>
              </div>
            )}

            {activeTab === 'pricing' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost Price (NGN) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    min="0"
                    step="0.01"
                    className={cn(
                      'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                      errors.costPrice ? 'border-red-300' : 'border-gray-200',
                    )}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Selling Price (NGN) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    min="0"
                    step="0.01"
                    className={cn(
                      'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                      errors.sellingPrice ? 'border-red-300' : 'border-gray-200',
                    )}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Compare Price</label>
                  <input
                    type="number"
                    value={comparePrice}
                    onChange={(e) => setComparePrice(e.target.value)}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

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
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Alert</label>
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
                    <span className="text-sm font-medium text-gray-700">Track Inventory</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSerialized}
                      onChange={(e) => setIsSerialized(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Serialized (IMEI tracked)</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'images' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {images.map((img) => (
                    <div key={img.id} className="relative group rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                      <img src={img.url} alt={img.altText ?? ''} className="w-full h-28 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      {img.isPrimary && (
                        <span className="absolute top-1 left-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Star size={10} /> Primary
                        </span>
                      )}
                      <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
                        {!img.isPrimary && (
                          <button type="button" onClick={() => setPrimaryMutation.mutate(img.id)} className="p-1 bg-white rounded shadow text-blue-600 hover:bg-blue-50" title="Set as primary">
                            <Star size={12} />
                          </button>
                        )}
                        <button type="button" onClick={() => deleteImageMutation.mutate(img.id)} className="p-1 bg-white rounded shadow text-red-500 hover:bg-red-50">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="Paste image URL..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    disabled={!newImageUrl}
                    onClick={() => { if (newImageUrl) addImageMutation.mutate(newImageUrl); }}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add URL
                  </button>
                  <input type="file" accept="image/*" className="hidden" ref={imageFileRef}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImageFile(f); e.target.value = ''; }}
                  />
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => imageFileRef.current?.click()}
                    className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Upload size={14} />
                    {uploadingImage ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

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
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
