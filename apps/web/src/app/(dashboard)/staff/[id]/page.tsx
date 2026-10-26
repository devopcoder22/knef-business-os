'use client';

import { useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, User, Calendar, ClipboardList, Plus, Target, CheckSquare, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'attendance' | 'duties' | 'responsibilities' | 'goals';

interface Employee {
  id: string;
  employeeNumber: string;
  jobTitle: string | null;
  employmentType: string;
  startDate: string;
  salary: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankCode: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  isActive: boolean;
  user: { id: string; firstName: string; lastName: string; email: string; phone: string | null; avatarUrl: string | null };
  department: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
}

interface AttendanceRecord {
  id: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: string | null;
  status: string;
  notes: string | null;
  correctionReason: string | null;
  correctedAt: string | null;
  correctedBy: { firstName: string; lastName: string } | null;
}

interface Duty {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  notes: string | null;
}

interface Responsibility {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
}

interface Goal {
  id: string;
  title: string;
  status: string;
  progress: number;
  endDate: string | null;
}

const ATTENDANCE_STATUS_COLORS: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-100 text-red-700',
  LATE: 'bg-yellow-100 text-yellow-700',
  HALF_DAY: 'bg-blue-100 text-blue-700',
  LEAVE: 'bg-purple-100 text-purple-700',
  HOLIDAY: 'bg-gray-100 text-gray-700',
  PARTIAL: 'bg-orange-100 text-orange-700',
  EXCUSED: 'bg-indigo-100 text-indigo-700',
  CORRECTED: 'bg-amber-100 text-amber-700',
};

const GOAL_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-blue-100 text-blue-700',
  ACHIEVED: 'bg-green-100 text-green-700',
  MISSED: 'bg-red-100 text-red-700',
  PAUSED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

function EmployeeDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showAddDuty, setShowAddDuty] = useState(false);
  const [showAddResp, setShowAddResp] = useState(false);
  const [dutyForm, setDutyForm] = useState({ title: '', description: '', startTime: '', endTime: '', notes: '' });
  const [respForm, setRespForm] = useState({ title: '', description: '', category: '', priority: 'MEDIUM' });

  const { data: employee, isLoading } = useQuery<Employee>({
    queryKey: ['employee', id],
    queryFn: async () => {
      const res = await api().get(`/employees/${id}`);
      return ((res.data as any)?.data ?? res.data) as Employee;
    },
  });

  const { data: attendance = [] } = useQuery<AttendanceRecord[]>({
    queryKey: ['employee-attendance', id],
    queryFn: async () => {
      const res = await api().get<{ data: AttendanceRecord[] }>(`/employees/${id}/attendance?limit=31`);
      return res.data.data;
    },
    enabled: activeTab === 'attendance',
  });

  const { data: duties = [] } = useQuery<Duty[]>({
    queryKey: ['employee-duties', id],
    queryFn: async () => {
      const res = await api().get(`/employees/${id}/duties`);
      return ((res.data as any)?.data ?? res.data) as Duty[];
    },
    enabled: activeTab === 'duties',
  });

  const { data: responsibilities = [] } = useQuery<Responsibility[]>({
    queryKey: ['employee-responsibilities', id],
    queryFn: async () => {
      const res = await api().get(`/responsibilities?employeeId=${id}`);
      return ((res.data as any)?.data ?? res.data) as Responsibility[];
    },
    enabled: activeTab === 'responsibilities',
  });

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ['employee-goals', id, employee?.user?.id],
    queryFn: async () => {
      if (!employee?.user?.id) return [];
      const res = await api().get(`/goals?ownerId=${employee.user.id}&limit=20`);
      return ((res.data as any)?.data ?? res.data) as Goal[];
    },
    enabled: activeTab === 'goals' && !!employee?.user?.id,
  });

  const addDutyMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/employees/${id}/duties`, dutyForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-duties', id] });
      setShowAddDuty(false);
      setDutyForm({ title: '', description: '', startTime: '', endTime: '', notes: '' });
    },
  });

  const addRespMutation = useMutation({
    mutationFn: async () => {
      await api().post('/responsibilities', { ...respForm, employeeId: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-responsibilities', id] });
      setShowAddResp(false);
      setRespForm({ title: '', description: '', category: '', priority: 'MEDIUM' });
    },
  });

  const deactivateRespMutation = useMutation({
    mutationFn: async (respId: string) => {
      await api().delete(`/responsibilities/${respId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-responsibilities', id] });
    },
  });

  if (isLoading) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;
  if (!employee) return <div className="text-gray-500">Employee not found</div>;

  const { user } = employee;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <span className="text-xl font-bold text-blue-600">{user.firstName?.[0] ?? '?'}{user.lastName?.[0] ?? ''}</span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{user.firstName} {user.lastName}</h1>
            <p className="text-gray-500 text-sm">{employee.jobTitle ?? 'Employee'} · {employee.employeeNumber}</p>
          </div>
          <span className={cn('ml-auto px-3 py-1 rounded-full text-xs font-medium', employee.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
            {employee.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          { key: 'overview', label: 'Overview', icon: User },
          { key: 'attendance', label: 'Attendance', icon: Calendar },
          { key: 'responsibilities', label: 'Responsibilities', icon: CheckSquare },
          { key: 'goals', label: 'Goals', icon: Target },
          { key: 'duties', label: 'Duties', icon: ClipboardList },
        ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              activeTab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Profile</h3>
            {[
              { label: 'Email', value: user.email },
              { label: 'Phone', value: user.phone ?? '—' },
              { label: 'Department', value: employee.department?.name ?? '—' },
              { label: 'Location', value: employee.location?.name ?? '—' },
              { label: 'Employment Type', value: employee.employmentType.replace('_', '-') },
              { label: 'Start Date', value: new Date(employee.startDate).toLocaleDateString('en-NG') },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500">{label}</span>
                <span className="text-sm font-medium text-gray-900">{value}</span>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            {employee.bankName && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Bank Details</h3>
                {[
                  { label: 'Bank', value: employee.bankName },
                  { label: 'Account No.', value: employee.bankAccount ?? '—' },
                  { label: 'Bank Code', value: employee.bankCode ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-500">{label}</span>
                    <span className="text-sm font-medium text-gray-900 font-mono">{value}</span>
                  </div>
                ))}
              </div>
            )}
            {(employee.emergencyName || employee.emergencyPhone) && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Emergency Contact</h3>
                <div className="flex justify-between py-1">
                  <span className="text-sm text-gray-500">Name</span>
                  <span className="text-sm font-medium text-gray-900">{employee.emergencyName ?? '—'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-sm text-gray-500">Phone</span>
                  <span className="text-sm font-medium text-gray-900">{employee.emergencyPhone ?? '—'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attendance tab */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Clock In</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Clock Out</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Hours</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Correction</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((rec) => (
                <tr key={rec.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{new Date(rec.date).toLocaleDateString('en-NG')}</td>
                  <td className="px-4 py-3 text-gray-500">{rec.clockIn ? new Date(rec.clockIn).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{rec.clockOut ? new Date(rec.clockOut).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{rec.hoursWorked ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ATTENDANCE_STATUS_COLORS[rec.status] ?? 'bg-gray-100 text-gray-600')}>
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {rec.correctedAt ? (
                      <span title={rec.correctionReason ?? ''}>
                        Corrected {rec.correctedBy ? `by ${rec.correctedBy.firstName}` : ''}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {attendance.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No attendance records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Responsibilities tab */}
      {activeTab === 'responsibilities' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddResp(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus size={16} /> Add Responsibility
            </button>
          </div>
          <div className="space-y-3">
            {responsibilities.map((resp) => (
              <div key={resp.id} className={cn('bg-white rounded-xl border p-4', resp.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{resp.title}</p>
                    {resp.description && <p className="text-sm text-gray-500 mt-1">{resp.description}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', PRIORITY_COLORS[resp.priority] ?? 'bg-gray-100 text-gray-600')}>
                        {resp.priority}
                      </span>
                      {resp.category && <span className="text-xs text-gray-400">{resp.category}</span>}
                      {!resp.isActive && <span className="text-xs text-gray-400 italic">Inactive</span>}
                    </div>
                  </div>
                  {resp.isActive && (
                    <button
                      onClick={() => deactivateRespMutation.mutate(resp.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                      title="Deactivate"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {responsibilities.length === 0 && (
              <div className="text-center py-12 text-gray-400">No responsibilities assigned</div>
            )}
          </div>

          {showAddResp && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
                <h2 className="text-lg font-semibold">Add Responsibility</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                    <input
                      type="text"
                      value={respForm.title}
                      onChange={e => setRespForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Daily POS reconciliation"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={respForm.description}
                      onChange={e => setRespForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <input
                      type="text"
                      value={respForm.category}
                      onChange={e => setRespForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="e.g. Operations"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={respForm.priority}
                      onChange={e => setRespForm(f => ({ ...f, priority: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowAddResp(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700">Cancel</button>
                  <button
                    onClick={() => addRespMutation.mutate()}
                    disabled={addRespMutation.isPending || !respForm.title}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    {addRespMutation.isPending ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Goals tab */}
      {activeTab === 'goals' && (
        <div className="space-y-3">
          {goals.map((goal) => (
            <div key={goal.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{goal.title}</p>
                  {goal.endDate && (
                    <p className="text-xs text-gray-400 mt-0.5">Due: {new Date(goal.endDate).toLocaleDateString('en-NG')}</p>
                  )}
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">Progress</span>
                      <span className="text-xs font-medium text-gray-700">{goal.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0', GOAL_STATUS_COLORS[goal.status] ?? 'bg-gray-100 text-gray-600')}>
                  {goal.status}
                </span>
              </div>
            </div>
          ))}
          {goals.length === 0 && (
            <div className="text-center py-12 text-gray-400">No goals assigned to this employee</div>
          )}
        </div>
      )}

      {/* Duties tab */}
      {activeTab === 'duties' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddDuty(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus size={16} /> Add Duty
            </button>
          </div>
          <div className="space-y-3">
            {duties.map((duty) => (
              <div key={duty.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="font-medium text-gray-900">{duty.title}</p>
                {duty.description && <p className="text-sm text-gray-500 mt-1">{duty.description}</p>}
                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                  <span>Start: {new Date(duty.startTime).toLocaleString('en-NG')}</span>
                  <span>End: {new Date(duty.endTime).toLocaleString('en-NG')}</span>
                </div>
              </div>
            ))}
            {duties.length === 0 && <div className="text-center py-12 text-gray-400">No duties scheduled</div>}
          </div>

          {showAddDuty && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
                <h2 className="text-lg font-semibold">Add Duty</h2>
                <div className="space-y-3">
                  {[
                    { label: 'Title', key: 'title', type: 'text', placeholder: 'e.g. Morning shift' },
                    { label: 'Description', key: 'description', type: 'text', placeholder: '' },
                    { label: 'Start Time', key: 'startTime', type: 'datetime-local', placeholder: '' },
                    { label: 'End Time', key: 'endTime', type: 'datetime-local', placeholder: '' },
                    { label: 'Notes', key: 'notes', type: 'text', placeholder: '' },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                      <input
                        type={type}
                        value={dutyForm[key as keyof typeof dutyForm]}
                        onChange={e => setDutyForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowAddDuty(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700">Cancel</button>
                  <button onClick={() => addDutyMutation.mutate()} disabled={addDutyMutation.isPending || !dutyForm.title} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">
                    {addDutyMutation.isPending ? 'Adding...' : 'Add Duty'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmployeeDetailPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-48 bg-gray-100 rounded-xl" />}>
      <EmployeeDetailContent />
    </Suspense>
  );
}
