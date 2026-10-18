'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Shield,
  Plus,
  Trash2,
  Upload,
  Edit2,
  Save,
  X,
  Briefcase,
} from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRole {
  id: string;
  assignedAt: string;
  role: { id: string; name: string };
  location: { id: string; name: string } | null;
}

interface PermissionOverride {
  id: string;
  permission: string;
  granted: boolean;
}

interface Employee {
  id: string;
  employeeNumber: string;
  jobTitle: string | null;
  employmentType: string;
  startDate: string;
  department: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
}

interface UserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: UserRole[];
  permissionOverrides: PermissionOverride[];
  employee: Employee | null;
}

interface RoleOption {
  id: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
}

interface ResolvedPermissions {
  userId: string;
  roles: string[];
  fromRoles: string[];
  grantedOverrides: string[];
  deniedOverrides: string[];
  effective: string[];
}

interface EffectiveFlag {
  key: string;
  name: string;
  description: string | null;
  orgEnabled: boolean;
  userState: 'INHERIT' | 'ENABLED' | 'DISABLED';
  effective: boolean;
}

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// ─── Permission group structure ────────────────────────────────────────────────

const PERMISSION_GROUPS = Object.entries(PERMISSIONS).map(([group, perms]) => ({
  group,
  permissions: Object.entries(perms).flatMap(([, value]) =>
    typeof value === 'string' ? [value as string] : Object.values(value as Record<string, string>),
  ),
}));

const AI_PERMISSIONS: string[] = [
  'ai.access',
  'ai.chat',
  'ai.providers',
  'ai.memory',
  'ai.knowledge',
  'ai.usage',
  'ai.tools',
  'ai.approvals',
  'ai.agents',
  'ai.autonomy',
];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-purple-100 text-purple-700',
};

function getActionColor(action: string): string {
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key)) return cls;
  }
  return 'bg-gray-100 text-gray-700';
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'roles' | 'permissions' | 'features' | 'ai' | 'audit';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'roles', label: 'Roles' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'features', label: 'Features' },
  { id: 'ai', label: 'AI Access' },
  { id: 'audit', label: 'Audit' },
];

// ─── Permission row ────────────────────────────────────────────────────────────

function PermissionRow({
  permission,
  resolved,
  canManage,
  userId,
  onMutate,
}: {
  permission: string;
  resolved: ResolvedPermissions;
  canManage: boolean;
  userId: string;
  onMutate: () => void;
}) {
  const inFromRoles = resolved.fromRoles.includes(permission);
  const isGranted = resolved.grantedOverrides.includes(permission);
  const isDenied = resolved.deniedOverrides.includes(permission);
  const hasOverride = isGranted || isDenied;

  let source = '—';
  let sourceCls = 'text-gray-400';
  let effectiveLabel = 'BLOCKED';
  let effectiveCls = 'bg-gray-100 text-gray-500';

  if (isDenied) {
    source = 'Override: Deny';
    sourceCls = 'text-red-600';
    effectiveLabel = 'DENIED';
    effectiveCls = 'bg-red-100 text-red-700';
  } else if (isGranted) {
    source = 'Override: Grant';
    sourceCls = 'text-blue-600';
    effectiveLabel = 'ALLOWED';
    effectiveCls = 'bg-blue-100 text-blue-700';
  } else if (inFromRoles) {
    source = 'From role';
    sourceCls = 'text-gray-600';
    effectiveLabel = 'ALLOWED';
    effectiveCls = 'bg-green-100 text-green-700';
  }

  const grantMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/permissions/users/${userId}/overrides`, { permission, granted: true });
    },
    onSuccess: onMutate,
  });

  const denyMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/permissions/users/${userId}/overrides`, { permission, granted: false });
    },
    onSuccess: onMutate,
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      await api().delete(`/permissions/users/${userId}/overrides/${encodeURIComponent(permission)}`);
    },
    onSuccess: onMutate,
  });

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 text-sm">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mono text-xs text-gray-600 truncate">{permission}</span>
        <span className={`text-xs ${sourceCls} whitespace-nowrap`}>{source}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${effectiveCls}`}>
          {effectiveLabel}
        </span>
        {canManage && (
          <div className="flex gap-1">
            {hasOverride ? (
              <button
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
                className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 border border-gray-200"
              >
                Remove Override
              </button>
            ) : (
              <>
                <button
                  onClick={() => grantMutation.mutate()}
                  disabled={grantMutation.isPending}
                  className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 border border-gray-200"
                >
                  Grant
                </button>
                <button
                  onClick={() => denyMutation.mutate()}
                  disabled={denyMutation.isPending}
                  className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 border border-gray-200"
                >
                  Deny
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission, user: currentAuthUser } = useAuthStore();
  const queryClient = useQueryClient();

  const canManageRoles = hasPermission(PERMISSIONS.ADMIN.MANAGE_ROLES);
  const canManageFlags = hasPermission(PERMISSIONS.ADMIN.MANAGE_FEATURE_FLAGS);
  const canManageUsers = hasPermission(PERMISSIONS.ADMIN.MANAGE_USERS);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['AI', 'PRODUCTS']));
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [addRoleForm, setAddRoleForm] = useState({ roleId: '', locationId: '' });

  // Edit profile state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // Email change state
  const [emailChangeStep, setEmailChangeStep] = useState<'idle' | 'input' | 'code'>('idle');
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailChangeMsg, setEmailChangeMsg] = useState<string | null>(null);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);

  // ── Queries ──

  const { data: user, isLoading: userLoading } = useQuery<UserDetail>({
    queryKey: ['user', id],
    queryFn: async () => {
      const res = await api().get(`/users/${id}`);
      return (res.data as any).data as UserDetail;
    },
  });

  const { data: resolved } = useQuery<{ data: ResolvedPermissions }>({
    queryKey: ['user-permissions', id],
    queryFn: async () => {
      const res = await api().get<{ data: ResolvedPermissions }>(`/permissions/users/${id}/resolved`);
      return res.data;
    },
    enabled: activeTab === 'permissions' || activeTab === 'ai',
  });

  const { data: effectiveFlags } = useQuery<{ data: EffectiveFlag[] }>({
    queryKey: ['user-flags', id],
    queryFn: async () => {
      const res = await api().get<{ data: EffectiveFlag[] }>(`/feature-flags/users/${id}/effective`);
      return res.data;
    },
    enabled: activeTab === 'features',
  });

  const { data: auditData } = useQuery<{ data: AuditLog[] }>({
    queryKey: ['user-audit', id],
    queryFn: async () => {
      const res = await api().get<{ data: AuditLog[] }>(`/audit?userId=${id}&limit=20`);
      return res.data;
    },
    enabled: activeTab === 'audit',
  });

  const { data: rolesOptions } = useQuery<{ data: RoleOption[] }>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api().get<{ data: RoleOption[] }>('/roles');
      return res.data;
    },
    enabled: activeTab === 'roles',
  });

  const { data: locationsOptions } = useQuery<{ data: LocationOption[] }>({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await api().get<{ data: LocationOption[] }>('/locations');
      return res.data;
    },
    enabled: activeTab === 'roles',
  });

  // ── User mutations ──

  const activateMutation = useMutation({
    mutationFn: async () => { await api().patch(`/users/${id}/activate`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', id] }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => { await api().patch(`/users/${id}/deactivate`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', id] }),
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName?: string; lastName?: string; phone?: string; avatarUrl?: string }) => {
      await api().patch(`/users/${id}/profile`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', id] });
      setEditingProfile(false);
    },
  });

  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api().post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = (res.data as any).data.url as string;
      await updateProfileMutation.mutateAsync({ avatarUrl: url });
    } catch {
      alert('Avatar upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Role mutations ──

  const removeRoleMutation = useMutation({
    mutationFn: async (userRoleId: string) => {
      await api().delete(`/users/${id}/roles/${userRoleId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', id] }),
  });

  const addRoleMutation = useMutation({
    mutationFn: async (data: { roleId: string; locationId?: string }) => {
      await api().post(`/users/${id}/roles`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', id] });
      setAddRoleOpen(false);
      setAddRoleForm({ roleId: '', locationId: '' });
    },
  });

  const sendPasswordResetMutation = useMutation({
    mutationFn: async () => { await api().post(`/users/${id}/send-password-reset`); },
    onSuccess: () => { setResetMsg('Password reset email sent successfully.'); setTimeout(() => setResetMsg(null), 4000); },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async () => { await api().delete(`/users/${id}`); },
    onSuccess: () => router.replace('/admin/users'),
  });

  const requestEmailChangeMutation = useMutation({
    mutationFn: async (newEmail: string) => {
      await api().post(`/users/${id}/request-email-change`, { newEmail });
    },
    onSuccess: () => {
      setEmailChangeStep('code');
      setEmailChangeError(null);
      setEmailChangeMsg('Verification code sent to the new email address.');
    },
    onError: (err: any) => {
      setEmailChangeError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to send code');
    },
  });

  const confirmEmailChangeMutation = useMutation({
    mutationFn: async (code: string) => {
      await api().post(`/users/${id}/confirm-email-change`, { code });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', id] });
      setEmailChangeStep('idle');
      setEmailChangeMsg('Email updated successfully.');
      setNewEmailInput('');
      setEmailCode('');
      setTimeout(() => setEmailChangeMsg(null), 4000);
    },
    onError: (err: any) => {
      setEmailChangeError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Invalid code');
    },
  });

  // ── Feature flag mutation ──

  const flagMutation = useMutation({
    mutationFn: async ({ key, state }: { key: string; state: 'INHERIT' | 'ENABLED' | 'DISABLED' }) => {
      await api().patch(`/feature-flags/users/${id}/${key}`, { state });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-flags', id] }),
  });

  // ── Helpers ──

  const invalidatePermissions = () => {
    queryClient.invalidateQueries({ queryKey: ['user-permissions', id] });
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  const initials = user
    ? `${user.firstName?.[0] ?? '?'}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : '??';

  // ── Loading state ──

  if (userLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20 text-gray-400">User not found.</div>
    );
  }

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {user.firstName} {user.lastName}
          </h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {resetMsg && (
            <div className="lg:col-span-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {resetMsg}
            </div>
          )}
          {/* Profile card */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <div className="flex items-start gap-5">
              {/* Avatar with upload */}
              <div className="relative group/avatar shrink-0">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={initials} className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xl">
                    {initials}
                  </div>
                )}
                {canManageUsers && (
                  <>
                    <button
                      type="button"
                      disabled={uploadingAvatar}
                      onClick={() => avatarFileRef.current?.click()}
                      className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity"
                    >
                      <Upload size={16} className="text-white" />
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={avatarFileRef}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }}
                    />
                  </>
                )}
              </div>

              <div className="flex-1">
                {editingProfile ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={profileForm.firstName}
                        onChange={(e) => setProfileForm((f) => ({ ...f, firstName: e.target.value }))}
                        placeholder="First name"
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={profileForm.lastName}
                        onChange={(e) => setProfileForm((f) => ({ ...f, lastName: e.target.value }))}
                        placeholder="Last name"
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="Phone number"
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateProfileMutation.mutate({ firstName: profileForm.firstName, lastName: profileForm.lastName, phone: profileForm.phone || undefined })}
                        disabled={updateProfileMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Save size={12} /> Save
                      </button>
                      <button
                        onClick={() => setEditingProfile(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                      >
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-lg font-semibold text-gray-900">
                        {user.firstName} {user.lastName}
                      </h2>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {user.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {user.isEmailVerified && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          <CheckCircle size={10} />
                          Email Verified
                        </span>
                      )}
                      {user.twoFactorEnabled && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          <Shield size={10} />
                          2FA
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{user.email}</p>
                    {user.phone && <p className="text-sm text-gray-500">{user.phone}</p>}
                    {canManageUsers && (
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <button
                          onClick={() => {
                            setProfileForm({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? '' });
                            setEditingProfile(true);
                          }}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <Edit2 size={11} /> Edit profile
                        </button>
                        {emailChangeStep === 'idle' && currentAuthUser?.id !== id && (
                          <button
                            onClick={() => { setEmailChangeStep('input'); setEmailChangeError(null); setEmailChangeMsg(null); }}
                            className="flex items-center gap-1 text-xs text-purple-600 hover:underline"
                          >
                            <Edit2 size={11} /> Change email
                          </button>
                        )}
                      </div>
                    )}
                    {/* Email change flow */}
                    {emailChangeMsg && (
                      <p className="mt-2 text-xs text-green-600">{emailChangeMsg}</p>
                    )}
                    {currentAuthUser?.id === id && canManageUsers && (
                      <p className="mt-2 text-xs text-gray-400">To change your email, ask another admin.</p>
                    )}
                    {emailChangeError && (
                      <p className="mt-2 text-xs text-red-600">{emailChangeError}</p>
                    )}
                    {emailChangeStep === 'input' && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <input
                          type="email"
                          value={newEmailInput}
                          onChange={(e) => setNewEmailInput(e.target.value)}
                          placeholder="New email address"
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 w-56"
                        />
                        <button
                          onClick={() => requestEmailChangeMutation.mutate(newEmailInput)}
                          disabled={requestEmailChangeMutation.isPending || !newEmailInput.trim()}
                          className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                        >
                          {requestEmailChangeMutation.isPending ? 'Sending…' : 'Send Code'}
                        </button>
                        <button onClick={() => setEmailChangeStep('idle')} className="text-xs text-gray-500 hover:underline">
                          Cancel
                        </button>
                      </div>
                    )}
                    {emailChangeStep === 'code' && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <input
                          type="text"
                          value={emailCode}
                          onChange={(e) => setEmailCode(e.target.value)}
                          placeholder="6-digit code"
                          maxLength={6}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 w-32 font-mono tracking-widest"
                        />
                        <button
                          onClick={() => confirmEmailChangeMutation.mutate(emailCode)}
                          disabled={confirmEmailChangeMutation.isPending || emailCode.length !== 6}
                          className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                        >
                          {confirmEmailChangeMutation.isPending ? 'Confirming…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => { setEmailChangeStep('input'); setEmailChangeError(null); }}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Resend
                        </button>
                        <button onClick={() => { setEmailChangeStep('idle'); setEmailChangeError(null); }} className="text-xs text-gray-500 hover:underline">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {canManageUsers && !editingProfile && (
                <div className="flex flex-col gap-2 items-end">
                  {user.isActive ? (
                    <button
                      onClick={() => deactivateMutation.mutate()}
                      disabled={deactivateMutation.isPending}
                      className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 whitespace-nowrap"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => activateMutation.mutate()}
                      disabled={activateMutation.isPending}
                      className="text-sm text-green-600 hover:text-green-700 font-medium px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-50 whitespace-nowrap"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => sendPasswordResetMutation.mutate()}
                    disabled={sendPasswordResetMutation.isPending}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 whitespace-nowrap"
                  >
                    {sendPasswordResetMutation.isPending ? 'Sending…' : 'Send Reset Link'}
                  </button>
                  {!deleteConfirm ? (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 whitespace-nowrap"
                    >
                      Delete User
                    </button>
                  ) : (
                    <div className="flex gap-1">
                      <button
                        onClick={() => deleteUserMutation.mutate()}
                        disabled={deleteUserMutation.isPending}
                        className="text-sm text-white bg-red-600 hover:bg-red-700 font-medium px-3 py-1.5 rounded-lg whitespace-nowrap"
                      >
                        Confirm Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(false)}
                        className="text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 font-medium px-3 py-1.5 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-100 pt-4">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Last Login</p>
                <p className="text-gray-700">
                  {user.lastLoginAt
                    ? format(new Date(user.lastLoginAt), 'MMM d, yyyy HH:mm')
                    : 'Never'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Joined</p>
                <p className="text-gray-700">
                  {format(new Date(user.createdAt), 'MMM d, yyyy')}
                </p>
              </div>
            </div>

            {/* Assigned roles */}
            {user.roles.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-400 mb-2">Assigned Roles</p>
                <div className="flex flex-wrap gap-2">
                  {user.roles.map((ur) => (
                    <div key={ur.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200">
                      <Shield size={11} className="text-blue-500" />
                      <span className="text-xs font-medium text-blue-700">
                        {ur.role.name.replace(/_/g, ' ')}
                      </span>
                      {ur.location && (
                        <span className="text-xs text-blue-500">@ {ur.location.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stats sidebar */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Account</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">User ID</dt>
                  <dd className="font-mono text-xs text-gray-600">{user.id.slice(0, 12)}…</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Roles</dt>
                  <dd className="text-gray-700">{user.roles.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Overrides</dt>
                  <dd className="text-gray-700">{user.permissionOverrides.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">2FA</dt>
                  <dd className={user.twoFactorEnabled ? 'text-green-600 font-medium' : 'text-gray-400'}>
                    {user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Employee card */}
            {user.employee ? (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase size={14} className="text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-700">Employee Record</h3>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Number</dt>
                    <dd className="font-mono text-xs text-gray-700">{user.employee.employeeNumber}</dd>
                  </div>
                  {user.employee.jobTitle && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Title</dt>
                      <dd className="text-gray-700 text-xs">{user.employee.jobTitle}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Type</dt>
                    <dd className="text-gray-700 text-xs">{user.employee.employmentType.replace(/_/g, ' ')}</dd>
                  </div>
                  {user.employee.department && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Department</dt>
                      <dd className="text-gray-700 text-xs">{user.employee.department.name}</dd>
                    </div>
                  )}
                  {user.employee.location && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Location</dt>
                      <dd className="text-gray-700 text-xs">{user.employee.location.name}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Since</dt>
                    <dd className="text-gray-700 text-xs">{format(new Date(user.employee.startDate), 'MMM d, yyyy')}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-4 text-center">
                <Briefcase size={20} className="mx-auto text-gray-300 mb-1" />
                <p className="text-xs text-gray-400">No employee record linked</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ROLES TAB ── */}
      {activeTab === 'roles' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Assigned Roles</h3>
            {canManageRoles && (
              <button
                onClick={() => setAddRoleOpen(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus size={14} />
                Add Role
              </button>
            )}
          </div>

          {user.roles.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No roles assigned.</p>
          ) : (
            <div className="space-y-2">
              {user.roles.map((ur) => (
                <div
                  key={ur.id}
                  className="flex items-center justify-between py-3 px-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Shield size={16} className="text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {ur.role.name.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-400">
                        {ur.location ? `Scoped to: ${ur.location.name}` : 'Global'}
                        {' · '}
                        Assigned {format(new Date(ur.assignedAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  {canManageRoles && (
                    <button
                      onClick={() => removeRoleMutation.mutate(ur.id)}
                      disabled={removeRoleMutation.isPending}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Remove role"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add role form */}
          {addRoleOpen && canManageRoles && (
            <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700">Add Role</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Role *</label>
                  <select
                    value={addRoleForm.roleId}
                    onChange={(e) => setAddRoleForm((f) => ({ ...f, roleId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Select role…</option>
                    {rolesOptions?.data.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Location (optional)</label>
                  <select
                    value={addRoleForm.locationId}
                    onChange={(e) => setAddRoleForm((f) => ({ ...f, locationId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Global (no location)</option>
                    {locationsOptions?.data.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setAddRoleOpen(false); setAddRoleForm({ roleId: '', locationId: '' }); }}
                  className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!addRoleForm.roleId) return;
                    addRoleMutation.mutate({
                      roleId: addRoleForm.roleId,
                      ...(addRoleForm.locationId && { locationId: addRoleForm.locationId }),
                    });
                  }}
                  disabled={!addRoleForm.roleId || addRoleMutation.isPending}
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Add Role
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PERMISSIONS TAB ── */}
      {activeTab === 'permissions' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Permission Overrides</h3>

          {!resolved ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            PERMISSION_GROUPS.filter((g) => g.permissions.length > 0).map(({ group, permissions }) => (
              <div key={group} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700"
                >
                  <span>{group}</span>
                  {expandedGroups.has(group) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {expandedGroups.has(group) && (
                  <div className="p-2 space-y-0.5">
                    {permissions.map((perm) => (
                      <PermissionRow
                        key={perm}
                        permission={perm}
                        resolved={resolved.data}
                        canManage={canManageRoles}
                        userId={id}
                        onMutate={invalidatePermissions}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── FEATURES TAB ── */}
      {activeTab === 'features' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Feature Flag Overrides</h3>

          {!effectiveFlags ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : effectiveFlags.data.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No feature flags configured.</p>
          ) : (
            <div className="space-y-2">
              {effectiveFlags.data.map((flag) => (
                <div
                  key={flag.key}
                  className="flex items-center justify-between py-3 px-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{flag.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          flag.orgEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        Org: {flag.orgEnabled ? 'On' : 'Off'}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          flag.effective ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        Effective: {flag.effective ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  {canManageFlags ? (
                    <select
                      value={flag.userState}
                      onChange={(e) =>
                        flagMutation.mutate({
                          key: flag.key,
                          state: e.target.value as 'INHERIT' | 'ENABLED' | 'DISABLED',
                        })
                      }
                      className="ml-4 px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="INHERIT">Inherit</option>
                      <option value="ENABLED">Enabled</option>
                      <option value="DISABLED">Disabled</option>
                    </select>
                  ) : (
                    <span className="ml-4 text-xs text-gray-500 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg">
                      {flag.userState}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AI ACCESS TAB ── */}
      {activeTab === 'ai' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-700">AI Permission Overrides</h3>
          </div>

          {!resolved ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {AI_PERMISSIONS.map((key) => (
                <PermissionRow
                  key={key}
                  permission={key}
                  resolved={resolved.data}
                  canManage={canManageRoles}
                  userId={id}
                  onMutate={invalidatePermissions}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AUDIT TAB ── */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Recent Activity</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">When</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Entity</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!auditData ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : auditData.data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                      No audit events found for this user.
                    </td>
                  </tr>
                ) : (
                  auditData.data.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="text-gray-700 font-medium">{log.entity}</span>
                        {log.entityId && (
                          <span className="text-gray-400 ml-1 font-mono">{log.entityId.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                        {log.ipAddress ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
