'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Eye, Edit2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Template {
  id: string;
  name: string;
  type: string;
  subject: string | null;
  body: string;
  variables: Record<string, string>;
  isActive: boolean;
  createdAt: string;
}

interface FormState {
  name: string;
  type: string;
  subject: string;
  body: string;
  isActive: boolean;
}

const defaultForm: FormState = {
  name: '',
  type: 'email',
  subject: '',
  body: '',
  isActive: true,
};

const TYPE_COLORS: Record<string, string> = {
  email: 'bg-blue-100 text-blue-700',
  telegram: 'bg-sky-100 text-sky-700',
  sms: 'bg-green-100 text-green-700',
  push: 'bg-purple-100 text-purple-700',
};

export default function TemplatesPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [previewResult, setPreviewResult] = useState<{ subject: string | null; body: string } | null>(null);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['communication-templates'],
    queryFn: async () => {
      const res = await api().get<{ data: Template[] }>('/communication-templates');
      return res.data.data ?? res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: FormState) =>
      api().post('/communication-templates', {
        name: data.name,
        type: data.type,
        subject: data.subject || undefined,
        body: data.body,
        isActive: data.isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communication-templates'] });
      setShowModal(false);
      setForm(defaultForm);
      setEditingId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormState }) =>
      api().patch(`/communication-templates/${id}`, {
        name: data.name,
        type: data.type,
        subject: data.subject || undefined,
        body: data.body,
        isActive: data.isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communication-templates'] });
      setShowModal(false);
      setForm(defaultForm);
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api().delete(`/communication-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['communication-templates'] }),
  });

  const previewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api().post<{ data: { subject: string | null; body: string } }>(
        `/communication-templates/${id}/preview`,
        { variables: {} },
      );
      return res.data.data ?? res.data;
    },
    onSuccess: (data) => setPreviewResult(data),
  });

  const openEdit = (template: Template) => {
    setEditingId(template.id);
    setForm({
      name: template.name,
      type: template.type,
      subject: template.subject ?? '',
      body: template.body,
      isActive: template.isActive,
    });
    setShowModal(true);
  };

  const groupedByType = templates.reduce<Record<string, Template[]>>((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Use {'{{variableName}}'} in your templates for dynamic content.
          </p>
        </div>
        <button
          onClick={() => { setEditingId(null); setForm(defaultForm); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          New Template
        </button>
      </div>

      {previewResult && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Preview</h3>
            <button onClick={() => setPreviewResult(null)} className="text-gray-400 hover:text-gray-600">Close</button>
          </div>
          {previewResult.subject && (
            <p className="text-sm text-gray-500 mb-2"><strong>Subject:</strong> {previewResult.subject}</p>
          )}
          <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap">{previewResult.body}</div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No templates yet.</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByType).map(([type, items]) => (
            <div key={type}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">{type}</h2>
              <div className="space-y-3">
                {items.map((template) => (
                  <div key={template.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">{template.name}</span>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_COLORS[template.type] ?? 'bg-gray-100 text-gray-600')}>
                          {template.type}
                        </span>
                        {!template.isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                        )}
                      </div>
                      {template.subject && (
                        <p className="text-xs text-gray-400">Subject: {template.subject}</p>
                      )}
                      <p className="text-xs text-gray-400 truncate mt-0.5">{template.body.slice(0, 80)}...</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => previewMutation.mutate(template.id)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Preview"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => openEdit(template)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
                        title="Edit"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(template.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit Template' : 'New Template'}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  <option value="email">Email</option>
                  <option value="telegram">Telegram</option>
                  <option value="sms">SMS</option>
                  <option value="push">Push</option>
                </select>
              </div>
              {form.type === 'email' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="Hello {{customerName}}!"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-40 resize-none"
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Use {{variableName}} for dynamic content"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Variables: use {'{{variableName}}'} syntax — e.g. {'{{customerName}}'}, {'{{orderTotal}}'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tplActive"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                <label htmlFor="tplActive" className="text-sm text-gray-700">Active</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setForm(defaultForm); setEditingId(null); }}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editingId) {
                    updateMutation.mutate({ id: editingId, data: form });
                  } else {
                    createMutation.mutate(form);
                  }
                }}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
