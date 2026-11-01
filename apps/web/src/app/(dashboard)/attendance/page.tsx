'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Users, CheckCircle, AlertCircle, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TodayOverview {
  date: string;
  totalEmployees: number;
  clockedIn: number;
  clockedOut: number;
  noRecord: number;
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
  clockInSource: string | null;
  employee: {
    id: string;
    employeeNumber: string;
    jobTitle: string | null;
    user: { id: string; firstName: string; lastName: string; email: string };
  };
  location: { id: string; name: string } | null;
}

interface CorrectionForm {
  clockIn: string;
  clockOut: string;
  correctionReason: string;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
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

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={cn('p-3 rounded-xl', color)}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctForm, setCorrectForm] = useState<CorrectionForm>({
    clockIn: '', clockOut: '', correctionReason: '', status: '',
  });

  const { data: overview } = useQuery<TodayOverview>({
    queryKey: ['attendance-overview'],
    queryFn: async () => {
      const res = await api().get('/attendance/overview/today');
      return ((res.data as any)?.data ?? res.data) as TodayOverview;
    },
    refetchInterval: 60_000,
  });

  const { data: records = [], isLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ['attendance-list', dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom, dateTo, limit: '100' });
      const res = await api().get(`/attendance?${params}`);
      return ((res.data as any)?.data ?? res.data) as AttendanceRecord[];
    },
  });

  const correctMutation = useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: Partial<CorrectionForm> }) => {
      await api().patch(`/attendance/${id}/correct`, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-list'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-overview'] });
      setCorrectingId(null);
      setCorrectForm({ clockIn: '', clockOut: '', correctionReason: '', status: '' });
    },
  });

  function openCorrection(rec: AttendanceRecord) {
    setCorrectingId(rec.id);
    setCorrectForm({
      clockIn: rec.clockIn ? new Date(rec.clockIn).toISOString().slice(0, 16) : '',
      clockOut: rec.clockOut ? new Date(rec.clockOut).toISOString().slice(0, 16) : '',
      correctionReason: '',
      status: rec.status,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="text-gray-500 text-sm mt-1">Monitor employee attendance and apply corrections with audit trail</p>
      </div>

      {/* Today overview */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Employees" value={overview.totalEmployees} icon={Users} color="bg-blue-500" />
          <StatCard label="Clocked In" value={overview.clockedIn} icon={Clock} color="bg-green-500" />
          <StatCard label="Clocked Out" value={overview.clockedOut} icon={CheckCircle} color="bg-gray-500" />
          <StatCard label="No Record Today" value={overview.noRecord} icon={AlertCircle} color="bg-orange-400" />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-end flex-wrap bg-white rounded-xl border border-gray-200 p-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Records table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="animate-pulse h-48 bg-gray-50" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Employee</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Clock In</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Clock Out</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Hours</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Source</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{rec.employee.user.firstName} {rec.employee.user.lastName}</p>
                    <p className="text-xs text-gray-400">{rec.employee.employeeNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{new Date(rec.date).toLocaleDateString('en-NG')}</td>
                  <td className="px-4 py-3 text-gray-500">{rec.clockIn ? new Date(rec.clockIn).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{rec.clockOut ? new Date(rec.clockOut).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{rec.hoursWorked ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[rec.status] ?? 'bg-gray-100 text-gray-600')}>
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{rec.clockInSource ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openCorrection(rec)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                      title="Correct record"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No attendance records for this period</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Correction modal */}
      {correctingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Correct Attendance Record</h2>
            <p className="text-sm text-gray-500">All corrections are audit-logged. Original values are preserved.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correction Reason *</label>
                <input
                  type="text"
                  value={correctForm.correctionReason}
                  onChange={e => setCorrectForm(f => ({ ...f, correctionReason: e.target.value }))}
                  placeholder="e.g. Employee forgot to clock out"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clock In</label>
                <input
                  type="datetime-local"
                  value={correctForm.clockIn}
                  onChange={e => setCorrectForm(f => ({ ...f, clockIn: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clock Out</label>
                <input
                  type="datetime-local"
                  value={correctForm.clockOut}
                  onChange={e => setCorrectForm(f => ({ ...f, clockOut: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={correctForm.status}
                  onChange={e => setCorrectForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['PRESENT', 'LATE', 'PARTIAL', 'EXCUSED', 'ABSENT', 'LEAVE', 'HOLIDAY', 'CORRECTED'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setCorrectingId(null); }}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const dto: Record<string, string> = { correctionReason: correctForm.correctionReason };
                  if (correctForm.clockIn) dto.clockIn = new Date(correctForm.clockIn).toISOString();
                  if (correctForm.clockOut) dto.clockOut = new Date(correctForm.clockOut).toISOString();
                  if (correctForm.status) dto.status = correctForm.status;
                  correctMutation.mutate({ id: correctingId, dto });
                }}
                disabled={correctMutation.isPending || !correctForm.correctionReason.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50"
              >
                {correctMutation.isPending ? 'Saving...' : 'Save Correction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
