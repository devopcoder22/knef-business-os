'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus,
  Search,
  CheckCircle,
  XCircle,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: Array<{ role: { id: string; name: string } }>;
}

interface UsersResponse {
  data: User[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface RoleOption {
  id: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
}

interface InviteForm {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  roleIds: string[];
  locationIds: string[];
}

const EMPTY_INVITE: InviteForm = {
  email: '',
  firstName: '',
  lastName: '',
  phone: '',
  roleIds: [],
  locationIds: [],
};

function toggleId(arr: string[], id: string): string[] {
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

export default function AdminUsersPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>(EMPTY_INVITE);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canManage = hasPermission(PERMISSIONS.ADMIN.MANAGE_USERS);

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: ['users', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search && { search }),
      });
      const res = await api().get<UsersResponse>(`/users?${params}`);
      return res.data;
    },
  });

  const { data: rolesData } = useQuery<{ data: RoleOption[] }>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api().get<{ data: RoleOption[] }>('/roles');
      return res.data;
    },
    enabled: inviteOpen,
  });

  const { data: locationsData } = useQuery<{ data: LocationOption[] }>({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await api().get<{ data: LocationOption[] }>('/locations');
      return res.data;
    },
    enabled: inviteOpen,
  });

  const deactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api().patch(`/users/${userId}/deactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api().patch(`/users/${userId}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (form: InviteForm) => {
      const res = await api().post<{ data: { tempPassword?: string } }>('/users/invite', {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        ...(form.phone && { phone: form.phone }),
        ...(form.roleIds.length > 0 && { roleIds: form.roleIds }),
        ...(form.locationIds.length > 0 && { locationIds: form.locationIds }),
      });
      return res.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setInviteOpen(false);
      setInviteForm(EMPTY_INVITE);
      const tempPassword = res?.data?.tempPassword;
      setSuccessMsg(
        tempPassword
          ? `User invited. Temporary password: ${tempPassword} — share this securely.`
          : 'User invited successfully.',
      );
      setTimeout(() => setSuccessMsg(null), 12000);
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate(inviteForm);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage user accounts and role assignments
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <UserPlus size={16} />
            Invite User
          </button>
        )}
      </div>

      {successMsg && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <CheckCircle size={16} className="mt-0.5 flex-shrink-0 text-green-600" />
          <span className="flex-1">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-green-600 hover:text-green-800">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search users..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Last Login</th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: canManage ? 6 : 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data?.data.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-4 py-12 text-center text-gray-400">
                    No users found
                  </td>
                </tr>
              ) : (
                data?.data.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="hover:text-blue-600 hover:underline"
                      >
                        {user.firstName} {user.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.slice(0, 2).map((ur) => (
                          <span
                            key={ur.role.id}
                            className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium"
                          >
                            {ur.role.name.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {user.roles.length > 2 && (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                            +{user.roles.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {user.isActive ? (
                          <CheckCircle size={10} />
                        ) : (
                          <XCircle size={10} />
                        )}
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {user.lastLoginAt
                        ? format(new Date(user.lastLoginAt), 'MMM d, yyyy HH:mm')
                        : 'Never'}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {user.isActive ? (
                            <button
                              onClick={() => deactivateMutation.mutate(user.id)}
                              className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => activateMutation.mutate(user.id)}
                              className="text-xs text-green-600 hover:text-green-700 font-medium px-2 py-1 rounded hover:bg-green-50"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.meta.total)} of{' '}
              {data.meta.total} users
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                disabled={page === data.meta.totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invite User Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Invite User</h2>
              <button
                onClick={() => { setInviteOpen(false); setInviteForm(EMPTY_INVITE); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteForm.firstName}
                    onChange={(e) => setInviteForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteForm.lastName}
                    onChange={(e) => setInviteForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  Phone
                </label>
                <input
                  type="tel"
                  value={inviteForm.phone}
                  onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {rolesData && rolesData.data.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2 block">
                    Roles
                  </label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {rolesData.data.map((role) => (
                      <label key={role.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={inviteForm.roleIds.includes(role.id)}
                          onChange={() =>
                            setInviteForm((f) => ({ ...f, roleIds: toggleId(f.roleIds, role.id) }))
                          }
                          className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-800">
                          {role.name.replace(/_/g, ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {locationsData && locationsData.data.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2 block">
                    Locations
                  </label>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {locationsData.data.map((loc) => (
                      <label key={loc.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={inviteForm.locationIds.includes(loc.id)}
                          onChange={() =>
                            setInviteForm((f) => ({ ...f, locationIds: toggleId(f.locationIds, loc.id) }))
                          }
                          className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-800">{loc.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {inviteMutation.isError && (
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                  Failed to invite user. Please try again.
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setInviteOpen(false); setInviteForm(EMPTY_INVITE); }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {inviteMutation.isPending ? 'Inviting…' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
