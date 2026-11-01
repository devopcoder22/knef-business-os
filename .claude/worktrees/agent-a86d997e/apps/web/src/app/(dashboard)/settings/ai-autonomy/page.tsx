'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type AutonomyLevel = 'ADVISORY' | 'DRAFT' | 'APPROVAL_REQUIRED' | 'LIMITED_AUTONOMY' | 'SCHEDULED_AUTONOMY';

interface AutonomyPolicy {
  id: string;
  scope: string;
  scopeId: string | null;
  level: AutonomyLevel;
  isActive: boolean;
  createdAt: string;
}

const LEVEL_LABELS: Record<AutonomyLevel, string> = {
  ADVISORY: 'Advisory',
  DRAFT: 'Draft',
  APPROVAL_REQUIRED: 'Approval Required',
  LIMITED_AUTONOMY: 'Limited Autonomy',
  SCHEDULED_AUTONOMY: 'Scheduled Autonomy',
};

const LEVEL_COLORS: Record<AutonomyLevel, string> = {
  ADVISORY: 'bg-gray-100 text-gray-700',
  DRAFT: 'bg-blue-100 text-blue-700',
  APPROVAL_REQUIRED: 'bg-yellow-100 text-yellow-700',
  LIMITED_AUTONOMY: 'bg-green-100 text-green-700',
  SCHEDULED_AUTONOMY: 'bg-purple-100 text-purple-700',
};

const SCOPES = ['org', 'user', 'agent'] as const;
const LEVELS: AutonomyLevel[] = ['ADVISORY', 'DRAFT', 'APPROVAL_REQUIRED', 'LIMITED_AUTONOMY', 'SCHEDULED_AUTONOMY'];

interface FormState {
  scope: string;
  scopeId: string;
  level: AutonomyLevel;
  isActive: boolean;
}

const DEFAULT_FORM: FormState = {
  scope: 'org',
  scopeId: '',
  level: 'APPROVAL_REQUIRED',
  isActive: true,
};

export default function AIAutonomyPage() {
  const [policies, setPolicies] = useState<AutonomyPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadPolicies() {
    setLoading(true);
    setError(null);
    try {
      const res = await api().get<AutonomyPolicy[]>('/ai/autonomy/policies');
      setPolicies(res.data);
    } catch {
      setError('Failed to load policies');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPolicies();
  }, []);

  function openCreate() {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(policy: AutonomyPolicy) {
    setForm({
      scope: policy.scope,
      scopeId: policy.scopeId ?? '',
      level: policy.level,
      isActive: policy.isActive,
    });
    setEditingId(policy.id);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        scope: form.scope,
        scopeId: form.scopeId || undefined,
        level: form.level,
        isActive: form.isActive,
      };

      if (editingId) {
        await api().patch(`/ai/autonomy/policies/${editingId}`, body);
      } else {
        await api().post('/ai/autonomy/policies', body);
      }

      setShowForm(false);
      await loadPolicies();
    } catch {
      setError('Failed to save policy');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this policy?')) return;
    setDeletingId(id);
    try {
      await api().delete(`/ai/autonomy/policies/${id}`);
      await loadPolicies();
    } catch {
      setError('Failed to delete policy');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Autonomy Policies</h1>
          <p className="text-sm text-gray-500 mt-1">
            Control how autonomously AI can act at the org, user, or agent scope.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Add Policy
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            {editingId ? 'Edit Policy' : 'New Policy'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
              <select
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {form.scope !== 'org' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.scope === 'user' ? 'User ID' : 'Agent ID'}
                </label>
                <input
                  type="text"
                  value={form.scopeId}
                  onChange={(e) => setForm((f) => ({ ...f, scopeId: e.target.value }))}
                  placeholder={`Enter ${form.scope} ID`}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Autonomy Level</label>
              <select
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as AutonomyLevel }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="isActive"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                Active
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save Policy'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-sm">No autonomy policies configured.</p>
          <p className="text-gray-400 text-xs mt-1">
            The default behaviour is <span className="font-medium">APPROVAL_REQUIRED</span> for all actions.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Scope</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Scope ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Level</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 capitalize font-medium text-gray-900">{policy.scope}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {policy.scopeId ?? <span className="italic text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[policy.level]}`}>
                      {LEVEL_LABELS[policy.level]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${policy.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {policy.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(policy.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(policy)}
                        className="px-3 py-1 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(policy.id)}
                        disabled={deletingId === policy.id}
                        className="px-3 py-1 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingId === policy.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
