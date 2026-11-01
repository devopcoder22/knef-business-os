'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Department {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface UsersResponse {
  data: User[];
  meta: { total: number };
}

export default function NewEmployeePage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [salary, setSalary] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await api().get<Department[]>('/departments');
      return res.data;
    },
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['locations-list'],
    queryFn: async () => {
      const res = await api().get<Location[]>('/locations');
      return res.data;
    },
  });

  const { data: usersData } = useQuery<UsersResponse>({
    queryKey: ['users-search', userSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (userSearch) params.set('search', userSearch);
      const res = await api().get<UsersResponse>(`/users?${params}`);
      return res.data;
    },
    enabled: userSearch.length >= 2 || userSearch.length === 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post<{ id: string }>('/employees', {
        userId,
        departmentId: departmentId || undefined,
        locationId: locationId || undefined,
        jobTitle: jobTitle || undefined,
        employmentType,
        startDate,
        salary: salary || undefined,
        bankName: bankName || undefined,
        bankAccount: bankAccount || undefined,
        bankCode: bankCode || undefined,
        emergencyName: emergencyName || undefined,
        emergencyPhone: emergencyPhone || undefined,
        notes: notes || undefined,
      });
      return (res.data as { id: string }).id;
    },
    onSuccess: (id) => router.push(`/staff/${id}`),
    onError: (err: { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message ?? 'Failed to create employee';
      setErrors({ submit: Array.isArray(msg) ? msg.join(', ') : msg });
    },
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!userId) errs['userId'] = 'Please select a user';
    if (!startDate) errs['startDate'] = 'Start date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) createMutation.mutate();
  };

  const inputCls = (hasErr = false) =>
    cn('w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500', hasErr ? 'border-red-300' : 'border-gray-200');

  const selectedUser = usersData?.data.find(u => u.id === userId);
  const users = usersData?.data ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Employee</h1>
          <p className="text-gray-500 text-sm mt-1">Link an existing user as an employee</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* User selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">User Account</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select User <span className="text-red-500">*</span>
            </label>
            <div className="relative mb-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {selectedUser && (
              <div className="mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
                Selected: {selectedUser.firstName} {selectedUser.lastName} ({selectedUser.email})
              </div>
            )}
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className={inputCls(!!errors.userId)}
              size={4}
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} — {u.email}
                </option>
              ))}
            </select>
            {errors.userId && <p className="text-xs text-red-500 mt-1">{errors.userId}</p>}
          </div>
        </div>

        {/* Role & employment */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Employment Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
              <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} className={inputCls()} placeholder="e.g. Sales Associate" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
              <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className={inputCls()}>
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={inputCls()}>
                <option value="">No department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)} className={inputCls()}>
                <option value="">No location</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls(!!errors.startDate)} />
              {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Salary (NGN)</label>
              <input type="number" step="0.01" min="0" value={salary} onChange={e => setSalary(e.target.value)} className={inputCls()} placeholder="0.00" />
            </div>
          </div>
        </div>

        {/* Bank details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Bank Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
              <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} className={inputCls()} placeholder="e.g. Zenith Bank" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
              <input type="text" value={bankAccount} onChange={e => setBankAccount(e.target.value)} className={inputCls()} placeholder="0123456789" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Code</label>
              <input type="text" value={bankCode} onChange={e => setBankCode(e.target.value)} className={inputCls()} placeholder="057" />
            </div>
          </div>
        </div>

        {/* Emergency contact */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Emergency Contact</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
              <input type="text" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} className={inputCls()} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
              <input type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} className={inputCls()} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errors.submit}</div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700">Cancel</button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {createMutation.isPending ? 'Creating...' : 'Create Employee'}
          </button>
        </div>
      </form>
    </div>
  );
}
