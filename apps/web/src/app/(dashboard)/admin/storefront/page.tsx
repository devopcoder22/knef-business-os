'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Upload, Monitor, Globe, Type, Bell, Image as ImageIcon } from 'lucide-react';
import { api } from '@/lib/api';

interface StorefrontSetting {
  key: string;
  value: string;
  label: string;
}

const SETTING_DEFS = [
  { key: 'storefront.storeName',        label: 'Store Name',             type: 'text',     placeholder: 'KNEF Gadgets',         section: 'brand' },
  { key: 'storefront.logoUrl',          label: 'Logo URL',               type: 'url',      placeholder: 'https://... or upload', section: 'brand' },
  { key: 'storefront.heroTitle',        label: 'Hero Heading',           type: 'text',     placeholder: 'The best smartphones…',  section: 'hero' },
  { key: 'storefront.heroSubtitle',     label: 'Hero Subheading',        type: 'textarea', placeholder: 'Shop from our wide selection…', section: 'hero' },
  { key: 'storefront.heroCtaText',      label: 'CTA Button Text',        type: 'text',     placeholder: 'Shop Now',               section: 'hero' },
  { key: 'storefront.heroBadgeText',    label: 'Hero Badge Text',        type: 'text',     placeholder: "Lagos's trusted gadget store", section: 'hero' },
  { key: 'storefront.featuredTitle',    label: 'Featured Section Title', type: 'text',     placeholder: 'Featured Products',      section: 'sections' },
  { key: 'storefront.categoryTitle',    label: 'Category Section Title', type: 'text',     placeholder: 'Shop by Category',       section: 'sections' },
  { key: 'storefront.ctaBannerTitle',   label: 'CTA Banner Title',       type: 'text',     placeholder: 'Ready to order?',        section: 'sections' },
  { key: 'storefront.ctaBannerText',    label: 'CTA Banner Text',        type: 'textarea', placeholder: 'No account needed…',     section: 'sections' },
  { key: 'storefront.announcementEnabled', label: 'Show Announcement Banner', type: 'toggle', placeholder: '', section: 'announcement' },
  { key: 'storefront.announcementText', label: 'Announcement Text',      type: 'textarea', placeholder: 'Free delivery on orders over ₦50,000!', section: 'announcement' },
  { key: 'storefront.announcementColor', label: 'Announcement Color',   type: 'select',   placeholder: '', section: 'announcement', options: ['blue','green','amber','red'] },
] as const;

const SECTIONS = [
  { id: 'brand',        label: 'Brand & Logo',    icon: Globe },
  { id: 'hero',         label: 'Hero Section',     icon: Monitor },
  { id: 'sections',     label: 'Page Sections',    icon: Type },
  { id: 'announcement', label: 'Announcement',     icon: Bell },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

export default function StorefrontSettingsPage() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<SectionId>('brand');
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [formError, setFormError] = useState('');
  const logoFileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ data: StorefrontSetting[] }>({
    queryKey: ['storefront-settings'],
    queryFn: async () => {
      const res = await api().get('/settings/storefront');
      return (res.data as any).data ? res.data : (res.data as any);
    },
  });

  useEffect(() => {
    if (data) {
      const map: Record<string, string> = {};
      const settings = Array.isArray(data) ? data : (data as any).data ?? [];
      for (const s of settings) {
        map[s.key] = s.value ?? '';
      }
      setForm((prev) => ({ ...map, ...prev }));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const settings = SETTING_DEFS.map((def) => ({
        key: def.key,
        value: form[def.key] ?? '',
        label: def.label,
      }));
      await api().post('/settings/storefront', { settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storefront-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to save');
    },
  });

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api().post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = (res.data as any).data.url as string;
      setForm((f) => ({ ...f, 'storefront.logoUrl': url }));
    } catch {
      setFormError('Logo upload failed');
    } finally {
      setUploadingLogo(false);
    }
  };

  const sectionDefs = SETTING_DEFS.filter((d) => d.section === activeSection);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Storefront Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Customise the public-facing storefront</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={15} />
          {saved ? 'Saved!' : saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>
      )}

      <div className="flex gap-6">
        {/* Section nav */}
        <nav className="w-48 shrink-0 space-y-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeSection === id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        {/* Fields */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            sectionDefs.map((def) => (
              <div key={def.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{def.label}</label>

                {def.type === 'toggle' ? (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, [def.key]: f[def.key] === 'true' ? 'false' : 'true' }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form[def.key] === 'true' ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        form[def.key] === 'true' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                ) : def.type === 'select' ? (
                  <select
                    value={form[def.key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [def.key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {(def as any).options?.map((opt: string) => (
                      <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
                    ))}
                  </select>
                ) : def.type === 'textarea' ? (
                  <textarea
                    value={form[def.key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [def.key]: e.target.value }))}
                    placeholder={def.placeholder}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                ) : def.key === 'storefront.logoUrl' ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={form[def.key] ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, [def.key]: e.target.value }))}
                        placeholder={def.placeholder}
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={logoFileRef}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }}
                      />
                      <button
                        type="button"
                        disabled={uploadingLogo}
                        onClick={() => logoFileRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Upload size={14} />
                        {uploadingLogo ? 'Uploading…' : 'Upload'}
                      </button>
                    </div>
                    {form[def.key] && (
                      <div className="flex items-center gap-3">
                        <img src={form[def.key]} alt="logo preview" className="h-12 w-12 object-contain rounded border border-gray-200 bg-gray-50" />
                        <span className="text-xs text-gray-500 truncate max-w-xs">{form[def.key]}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type={def.type}
                    value={form[def.key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [def.key]: e.target.value }))}
                    placeholder={def.placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Live preview hint */}
      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
        <ImageIcon size={14} />
        Changes are reflected on the storefront immediately after saving. Open{' '}
        <a href="http://localhost:3001" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
          localhost:3001
        </a>{' '}
        to preview.
      </div>
    </div>
  );
}
