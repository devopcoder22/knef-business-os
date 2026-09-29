'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Copy, Shield, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { ALL_PERMISSIONS, PERMISSIONS } from '@knef/constants';
import { useAuthStore } from '@/stores/auth.store';

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  _count: { permissions: number; userRoles: number };
  permissions?: Array<{ permission: string }>;
}

interface RolesResponse {
  data: Role[];
}

const PERMISSION_GROUPS = Object.entries(PERMISSIONS).map(([group, perms]) => ({
  group,
  permissions: Object.entries(perms).map(([key, value]) => ({ key, value: value as string })),
}));

export default function AdminRolesPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['PRODUCTS', 'SALES']));

  const canManage = hasPermission(PERMISSIONS.ADMIN.MANAGE_ROLES);

  const { data, isLoading } = useQuery<RolesResponse>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api().get<RolesResponse>('/roles');
      return res.data;
    },
  });

  const { data: roleDetail } = useQuery({
    queryKey: ['role', selectedRole?.id],
    queryFn: async () => {
      if (!selectedRole) return null;
      const res = await api().get<{ data: Role }>(`/roles/${selectedRole.id}`);
      return res.data.data;
    },
    enabled: !!selectedRole,
  });

  const updatePermsMutation = useMutation({
    mutationFn: async ({ roleId, permissions }: { roleId: string; permissions: string[] }) => {
      await api().patch(`/roles/${roleId}`, { permissions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role', selectedRole?.id] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async ({ roleId, name }: { roleId: string; name: string }) => {
      await api().post(`/roles/${roleId}/clone`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  const activePermissions = new Set(roleDetail?.permissions?.map((p) => p.permission) ?? []);

  const togglePermission = (permission: string) => {
    if (!roleDetail || !canManage || roleDetail.isSystem) return;
    const newPerms = new Set(activePermissions);
    if (newPerms.has(permission)) {
      newPerms.delete(permission);
    } else {
      newPerms.add(permission);
    }
    updatePermsMutation.mutate({
      roleId: roleDetail.id,
      permissions: Array.from(newPerms),
    });
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Role Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure roles and their permission sets
          </p>
        </div>
        {canManage && (
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={16} />
            New Role
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role list */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Roles</h3>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))
          ) : (
            data?.data.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedRole?.id === role.id
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-blue-500" />
                    <span className="text-sm font-medium text-gray-900">
                      {role.name.replace(/_/g, ' ')}
                    </span>
                    {role.isSystem && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700">
                        System
                      </span>
                    )}
                  </div>
                  {canManage && !role.isSystem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const name = prompt(`Clone "${role.name}" as:`);
                        if (name) cloneMutation.mutate({ roleId: role.id, name });
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title="Clone role"
                    >
                      <Copy size={12} />
                    </button>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {role._count.permissions} permissions &bull; {role._count.userRoles} users
                </div>
              </button>
            ))
          )}
        </div>

        {/* Permission matrix */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
          {selectedRole ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  Permissions: {selectedRole.name.replace(/_/g, ' ')}
                </h3>
                {selectedRole.isSystem && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                    System role — read only
                  </span>
                )}
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {PERMISSION_GROUPS.map(({ group, permissions }) => (
                  <div key={group} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleGroup(group)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700"
                    >
                      <span>{group}</span>
                      {expandedGroups.has(group) ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>
                    {expandedGroups.has(group) && (
                      <div className="p-2 space-y-1">
                        {permissions.map(({ key, value }) => (
                          <label
                            key={value}
                            className={`flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer ${
                              canManage && !selectedRole.isSystem ? 'hover:bg-gray-50' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={activePermissions.has(value)}
                              onChange={() => togglePermission(value)}
                              disabled={!canManage || selectedRole.isSystem}
                              className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
                            />
                            <div>
                              <p className="text-sm text-gray-800">{key.replace(/_/g, ' ')}</p>
                              <p className="text-xs text-gray-400 font-mono">{value}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <div className="text-center">
                <Shield size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a role to view and edit permissions</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
