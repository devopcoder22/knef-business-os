'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, UserCog, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';

interface Employee {
  id: string;
  employeeNumber: string;
  jobTitle: string | null;
  employmentType: EmploymentType;
  startDate: string;
  isActive: boolean;
  user: { id: string; firstName: string; lastName: string; email: string; avatarUrl: string | null };
  department: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
}

interface EmployeesResponse {
  data: Employee[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const EMP_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERN: 'Intern',
};

const EMP_TYPE_COLORS: Record<EmploymentType, string> = {
  FULL_TIME: 'bg-blue-100 text-blue-700',
  PART_TIME: 'bg-purple-100 text-purple-700',
  CONTRACT: 'bg-amber-100 text-amber-700',
  INTERN: 'bg-gray-100 text-gray-700',
};

export default function StaffPage() {
  const [page, setPage] = useState(1);
  const [isActiveFilter, setIsActiveFilter] = useState('');

  const { data, isLoading } = useQuery<EmployeesResponse>({
    queryKey: ['employees', page, isActiveFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (isActiveFilter !== '') params.set('isActive', isActiveFilter);
      const res = await api().get<EmployeesResponse>(`/employees?${params}`);
      return res.data;
    },
  });

  const employees = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your team members</p>
        </div>
        <Link
          href="/staff/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Employee
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={isActiveFilter}
            onChange={(e) => { setIsActiveFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Employee</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Employee No.</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Job Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Department</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Start Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : employees.map((emp) => (
                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            {emp.user.avatarUrl ? (
                              <img src={emp.user.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                              <span className="text-sm font-bold text-blue-600">
                                {emp.user.firstName[0]}{emp.user.lastName[0]}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{emp.user.firstName} {emp.user.lastName}</p>
                            <p className="text-xs text-gray-400">{emp.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{emp.employeeNumber}</td>
                      <td className="px-4 py-3 text-gray-700">{emp.jobTitle ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{emp.department?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', EMP_TYPE_COLORS[emp.employmentType])}>
                          {EMP_TYPE_LABELS[emp.employmentType]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(emp.startDate).toLocaleDateString('en-NG')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', emp.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                          {emp.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/staff/${emp.id}`} className="text-xs text-blue-600 hover:underline">View</Link>
                      </td>
                    </tr>
                  ))}
              {!isLoading && employees.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    <UserCog size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No employees found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">{(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Previous</button>
              <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
