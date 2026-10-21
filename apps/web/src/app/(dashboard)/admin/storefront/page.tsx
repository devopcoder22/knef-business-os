'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Upload, Monitor, Globe, Type, Bell, Image as ImageIcon, Phone, Share2, MessageCircle } from 'lucide-react';
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
  { key: 'storefront.footerDescription', label: 'Footer Tagline',       type: 'textarea', placeholder: 'Your trusted destination for smartphones…', section: 'contact' },
  { key: 'storefront.footerAddress',     label: 'Address',              type: 'text',     placeholder: 'Lagos, Nigeria',              section: 'contact' },
  { key: 'storefront.footerPhone',       label: 'Phone Number',         type: 'text',     placeholder: '+234 800 000 0000',            section: 'contact' },
  { key: 'storefront.footerEmail',       label: 'Email Address',        type: 'text',     placeholder: 'info@knef.ng',                section: 'contact' },
] as const;

const SOCIAL_PLATFORMS = [
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/your-handle' },
  { id: 'facebook',  label: 'Facebook',  placeholder: 'https://facebook.com/your-page' },
  { id: 'tiktok',    label: 'TikTok',    placeholder: 'https://tiktok.com/@your-handle' },
  { id: 'twitter',   label: 'X / Twitter', placeholder: 'https://x.com/your-handle' },
  { id: 'youtube',   label: 'YouTube',   placeholder: 'https://youtube.com/@your-channel' },
  { id: 'linkedin',  label: 'LinkedIn',  placeholder: 'https://linkedin.com/company/your-company' },
  { id: 'snapchat',  label: 'Snapchat',  placeholder: 'https://snapchat.com/add/your-handle' },
] as const;

const SECTIONS = [
  { id: 'brand',        label: 'Brand & Logo',    icon: Globe },
  { id: 'hero',         label: 'Hero Section',     icon: Monitor },
  { id: 'sections',     label: 'Page Sections',    icon: Type },
  { id: 'announcement', label: 'Announcement',     icon: Bell },
  { id: 'contact',      label: 'Footer & Contact', icon: Phone },
  { id: 'social',       label: 'Social Media',     icon: Share2 },
  { id: 'whatsapp',     label: 'WhatsApp CTA',     icon: MessageCircle },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function StorefrontSettingsPage() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<SectionId>('brand');
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [formError, setFormError] = useState('');
  const [urlErrors, setUrlErrors] = useState<Record<string, string>>({});
  const [waNumError, setWaNumError] = useState('');
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

  // Collect ALL setting keys to save (original + social + whatsapp)
  const getAllSettings = () => {
    const settings = SETTING_DEFS.map((def) => ({
      key: def.key,
      value: form[def.key] ?? '',
      label: def.label,
    }));

    // Social platforms
    for (const p of SOCIAL_PLATFORMS) {
      settings.push({ key: `social_${p.id}_url`,     value: form[`social_${p.id}_url`] ?? '',     label: `${p.label} URL` });
      settings.push({ key: `social_${p.id}_enabled`, value: form[`social_${p.id}_enabled`] ?? 'false', label: `${p.label} Enabled` });
    }

    // WhatsApp
    settings.push({ key: 'whatsapp_number',  value: form['whatsapp_number'] ?? '',  label: 'WhatsApp Number' });
    settings.push({ key: 'whatsapp_message', value: form['whatsapp_message'] ?? '', label: 'WhatsApp Prefilled Message' });
    settings.push({ key: 'whatsapp_enabled', value: form['whatsapp_enabled'] ?? 'false', label: 'WhatsApp Enabled' });

    return settings;
  };

  const validateBeforeSave = (): boolean => {
    const newUrlErrors: Record<string, string> = {};
    for (const p of SOCIAL_PLATFORMS) {
      const val = form[`social_${p.id}_url`] ?? '';
      if (val && !val.startsWith('https://')) {
        newUrlErrors[`social_${p.id}_url`] = 'URL must start with https://';
      }
    }
    setUrlErrors(newUrlErrors);

    const rawNum = (form['whatsapp_number'] ?? '').replace(/[\s+\-]/g, '');
    let waErr = '';
    if (rawNum && !/^\d{7,15}$/.test(rawNum)) {
      waErr = 'WhatsApp number must be 7–15 digits (include country code, digits only).';
    }
    setWaNumError(waErr);

    return Object.keys(newUrlErrors).length === 0 && !waErr;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!validateBeforeSave()) throw new Error('Validation failed');
      const settings = getAllSettings();
      await api().post('/settings/storefront', { settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storefront-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err: any) => {
      if (err.message === 'Validation failed') return;
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

  // WhatsApp preview URL
  const waNum = (form['whatsapp_number'] ?? '').replace(/[\s+\-]/g, '');
  const waMsg = form['whatsapp_message'] ?? '';
  const waPreviewUrl = waNum
    ? `wa.me/${waNum}${waMsg ? `?text=${encodeURIComponent(waMsg)}` : ''}`
    : '';

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
          ) : activeSection === 'social' ? (
            /* ── Social Media Links ── */
            <div className="space-y-5">
              <p className="text-sm text-gray-500">
                Enter your brand's social media profile URLs. Toggle each platform on to display its icon in the storefront footer.
              </p>
              {SOCIAL_PLATFORMS.map((p) => {
                const urlKey = `social_${p.id}_url`;
                const enabledKey = `social_${p.id}_enabled`;
                const enabled = form[enabledKey] === 'true';
                const urlVal = form[urlKey] ?? '';
                const urlErr = urlErrors[urlKey];
                return (
                  <div key={p.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-700">{p.label} URL</label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Enabled</span>
                        <Toggle
                          value={enabled}
                          onChange={(v) => setForm((f) => ({ ...f, [enabledKey]: String(v) }))}
                        />
                      </div>
                    </div>
                    <input
                      type="url"
                      value={urlVal}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, [urlKey]: e.target.value }));
                        if (urlErrors[urlKey]) setUrlErrors((prev) => { const n = { ...prev }; delete n[urlKey]; return n; });
                      }}
                      placeholder={p.placeholder}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        urlErr ? 'border-red-400 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                    {urlErr && <p className="text-xs text-red-600">{urlErr}</p>}
                  </div>
                );
              })}
            </div>
          ) : activeSection === 'whatsapp' ? (
            /* ── WhatsApp CTA ── */
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Show WhatsApp button in storefront header</p>
                  <p className="text-xs text-gray-500 mt-0.5">Displays a floating WhatsApp contact button for customers.</p>
                </div>
                <Toggle
                  value={form['whatsapp_enabled'] === 'true'}
                  onChange={(v) => setForm((f) => ({ ...f, whatsapp_enabled: String(v) }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">International Phone Number</label>
                <input
                  type="text"
                  value={form['whatsapp_number'] ?? ''}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, whatsapp_number: e.target.value }));
                    if (waNumError) setWaNumError('');
                  }}
                  placeholder="2348012345678"
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    waNumError ? 'border-red-400 bg-red-50' : 'border-gray-200'
                  }`}
                />
                {waNumError ? (
                  <p className="text-xs text-red-600">{waNumError}</p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Include country code, digits only. Example: <strong>2348012345678</strong> for +234 (Nigeria)
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Prefilled Message</label>
                <textarea
                  value={form['whatsapp_message'] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, whatsapp_message: e.target.value }))}
                  placeholder="Hello KNEF Gadgets, I would like to make an enquiry."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <p className="text-xs text-gray-500">This message will be pre-filled when a customer taps the WhatsApp button.</p>
              </div>

              {waPreviewUrl && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 space-y-1">
                  <p className="text-xs font-medium text-green-700">Link Preview</p>
                  <a
                    href={`https://${waPreviewUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-600 break-all hover:underline font-mono"
                  >
                    {waPreviewUrl}
                  </a>
                </div>
              )}
            </div>
          ) : (
            /* ── Standard setting fields ── */
            sectionDefs.map((def) => (
              <div key={def.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{def.label}</label>

                {def.type === 'toggle' ? (
                  <Toggle
                    value={form[def.key] === 'true'}
                    onChange={(v) => setForm((f) => ({ ...f, [def.key]: String(v) }))}
                  />
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
        <a href="https://knefgadgets.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
          knefgadgets.com
        </a>{' '}
        to preview.
      </div>
    </div>
  );
}
