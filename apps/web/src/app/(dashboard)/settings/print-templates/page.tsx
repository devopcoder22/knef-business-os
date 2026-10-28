'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Star, FileText, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type TemplateType = 'RECEIPT' | 'INVOICE' | 'PO' | 'GRN' | 'QUOTATION' | 'BARCODE_LABEL';

interface PrintTemplate {
  id: string;
  name: string;
  templateType: TemplateType;
  isDefault: boolean;
  createdAt: string;
}

interface TemplateForm {
  name: string;
  templateType: TemplateType;
  content: string;
  isDefault: boolean;
}

const TEMPLATE_TYPES: TemplateType[] = [
  'RECEIPT',
  'INVOICE',
  'PO',
  'GRN',
  'QUOTATION',
  'BARCODE_LABEL',
];

const TYPE_BADGE: Record<TemplateType, string> = {
  RECEIPT: 'bg-emerald-100 text-emerald-700',
  INVOICE: 'bg-blue-100 text-blue-700',
  PO: 'bg-amber-100 text-amber-700',
  GRN: 'bg-purple-100 text-purple-700',
  QUOTATION: 'bg-indigo-100 text-indigo-700',
  BARCODE_LABEL: 'bg-gray-100 text-gray-700',
};

const TYPE_LABELS: Record<TemplateType, string> = {
  RECEIPT: 'Receipt',
  INVOICE: 'Invoice',
  PO: 'Purchase Order',
  GRN: 'Goods Received Note',
  QUOTATION: 'Quotation',
  BARCODE_LABEL: 'Barcode Label',
};

const AVAILABLE_VARS: Record<TemplateType, string[]> = {
  RECEIPT: ['org.name', 'org.phone', 'order.reference', 'order.date', 'payment.method', 'items', 'total'],
  INVOICE: ['org.name', 'order.reference', 'customer.name', 'items', 'subtotal', 'tax', 'total'],
  PO: ['org.name', 'po.reference', 'supplier.name', 'items', 'total'],
  GRN: ['po.reference', 'grn.reference', 'items', 'receivedAt'],
  QUOTATION: ['org.name', 'customer.name', 'items', 'validUntil', 'total'],
  BARCODE_LABEL: ['product.name', 'product.sku', 'product.barcode', 'product.price'],
};

const DEFAULT_FORM: TemplateForm = {
  name: '',
  templateType: 'RECEIPT',
  content: '',
  isDefault: false,
};

const FORBIDDEN_PATTERNS = [/<script/i, /javascript:/i, /\bon\w+\s*=/i, /\beval\s*\(/i];

function validateContent(content: string): string | null {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      return 'Content cannot contain <script>, javascript:, event handlers, or eval()';
    }
  }
  return null;
}

export default function PrintTemplatesPage() {
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(DEFAULT_FORM);
  const [contentError, setContentError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['print-templates'],
    queryFn: async () => {
      const res = await api().get<{ data: PrintTemplate[] }>('/print-templates');
      return res.data.data;
    },
  });
  const templates = data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const err = validateContent(form.content);
      if (err) throw new Error(err);
      await api().post('/print-templates', {
        name: form.name,
        templateType: form.templateType,
        content: form.content,
        isDefault: form.isDefault,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['print-templates'] });
      setShowCreate(false);
      setForm(DEFAULT_FORM);
      setContentError(null);
      setApiError(null);
    },
    onError: (err: any) => {
      const msg = err?.message ?? 'Failed to create template';
      if (FORBIDDEN_PATTERNS.some((p) => p.test(msg))) setContentError(msg);
      else setApiError(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      const err = validateContent(form.content);
      if (err) throw new Error(err);
      await api().put(`/print-templates/${id}`, {
        name: form.name,
        content: form.content,
        isDefault: form.isDefault,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['print-templates'] });
      setEditingId(null);
      setForm(DEFAULT_FORM);
      setContentError(null);
      setApiError(null);
    },
    onError: (err: any) => {
      const msg = err?.message ?? 'Failed to update template';
      setApiError(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().delete(`/print-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['print-templates'] });
      setDeletingId(null);
    },
    onError: () => {
      setDeletingId(null);
      setApiError('Failed to delete template');
    },
  });

  function openEdit(template: PrintTemplate) {
    // We need to fetch content separately via the update form
    // Since GET list doesn't return content, pre-fill name/type and let user edit content
    setForm({
      name: template.name,
      templateType: template.templateType,
      content: '',
      isDefault: template.isDefault,
    });
    setEditingId(template.id);
    setShowCreate(false);
    setContentError(null);
    setApiError(null);
  }

  function openCreate() {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setShowCreate(true);
    setContentError(null);
    setApiError(null);
  }

  function handleFormChange(patch: Partial<TemplateForm>) {
    setForm((f) => ({ ...f, ...patch }));
    if (patch.content !== undefined) {
      const err = validateContent(patch.content);
      setContentError(err);
    }
  }

  function handleCancel() {
    setShowCreate(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setContentError(null);
    setApiError(null);
  }

  const isFormMode = showCreate || !!editingId;
  const formTitle = editingId ? 'Edit Template' : 'New Template';
  const activeType = form.templateType;
  const vars = AVAILABLE_VARS[activeType];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Print Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage Handlebars templates for receipts, invoices, purchase orders, and more
          </p>
        </div>
        {!isFormMode && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} />
            New Template
          </button>
        )}
      </div>

      {apiError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={16} />
          {apiError}
        </div>
      )}

      {/* Form panel */}
      {isFormMode && (
        <div className="bg-white rounded-xl border border-blue-200 ring-1 ring-blue-100 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">{formTitle}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleFormChange({ name: e.target.value })}
                placeholder="e.g. Standard A4 Invoice"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Type</label>
              <select
                value={form.templateType}
                onChange={(e) => handleFormChange({ templateType: e.target.value as TemplateType })}
                disabled={!!editingId}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                {TEMPLATE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              {editingId && (
                <p className="text-xs text-gray-400 mt-1">Type cannot be changed after creation.</p>
              )}
            </div>
          </div>

          {/* Available variables hint */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-600 mb-2">
              Available variables for {TYPE_LABELS[activeType]}:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {vars.map((v) => (
                <code
                  key={v}
                  className="text-xs bg-white border border-gray-200 text-indigo-700 rounded px-1.5 py-0.5 font-mono"
                >
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
            {activeType === 'RECEIPT' && (
              <p className="text-xs text-gray-400 mt-2">
                Use{' '}
                <code className="bg-white border border-gray-200 rounded px-1 font-mono">
                  {'{{#each items}}'}
                </code>{' '}
                /{' '}
                <code className="bg-white border border-gray-200 rounded px-1 font-mono">
                  {'{{/each}}'}
                </code>{' '}
                to loop over items.
              </p>
            )}
          </div>

          {/* Content textarea */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Content</label>
            <textarea
              value={form.content}
              onChange={(e) => handleFormChange({ content: e.target.value })}
              rows={14}
              placeholder={`<div class="receipt">\n  <h1>{{org.name}}</h1>\n  <p>{{order.reference}}</p>\n  {{#each items}}\n    <p>{{this.name}} — {{this.price}}</p>\n  {{/each}}\n  <strong>Total: {{total}}</strong>\n</div>`}
              className={cn(
                'w-full font-mono text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y',
                contentError ? 'border-red-400' : 'border-gray-200'
              )}
            />
            {contentError ? (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle size={12} />
                {contentError}
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">
                Handlebars syntax supported. Content cannot contain{' '}
                <code className="bg-gray-100 rounded px-1">&lt;script&gt;</code>,{' '}
                <code className="bg-gray-100 rounded px-1">javascript:</code>, event handlers, or{' '}
                <code className="bg-gray-100 rounded px-1">eval()</code>.
              </p>
            )}
          </div>

          {/* Is Default */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => handleFormChange({ isDefault: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Set as default template for {TYPE_LABELS[activeType]}
            </span>
          </label>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => (editingId ? updateMutation.mutate(editingId) : createMutation.mutate())}
              disabled={
                !form.name.trim() ||
                !form.content.trim() ||
                !!contentError ||
                createMutation.isPending ||
                updateMutation.isPending
              }
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editingId
                ? 'Save Changes'
                : 'Create Template'}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Templates list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No print templates yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              Create templates to customise how documents are printed.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Default</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {templates.map((tpl) => (
                <tr key={tpl.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-medium text-gray-900">{tpl.name}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        TYPE_BADGE[tpl.templateType]
                      )}
                    >
                      {TYPE_LABELS[tpl.templateType]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {tpl.isDefault ? (
                      <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                        <Star size={12} className="fill-amber-500 text-amber-500" />
                        Default
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    {new Date(tpl.createdAt).toLocaleDateString('en-NG', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(tpl)}
                        disabled={!!editingId || showCreate}
                        className="flex items-center gap-1 px-3 py-1 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-40 transition-colors"
                      >
                        <Pencil size={11} />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Delete "${tpl.name}"? This cannot be undone.`)) return;
                          setDeletingId(tpl.id);
                          deleteMutation.mutate(tpl.id);
                        }}
                        disabled={deletingId === tpl.id}
                        className="flex items-center gap-1 px-3 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                      >
                        <Trash2 size={11} />
                        {deletingId === tpl.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Type reference cards */}
      {!isFormMode && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Template Variable Reference</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATE_TYPES.map((type) => (
              <div key={type} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                      TYPE_BADGE[type]
                    )}
                  >
                    {TYPE_LABELS[type]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {AVAILABLE_VARS[type].map((v) => (
                    <code
                      key={v}
                      className="text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded px-1 py-0.5 font-mono"
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
