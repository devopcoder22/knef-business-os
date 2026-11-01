'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, CheckCircle, LogIn, LogOut, Target, ClipboardList, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ClockStatus {
  isClockedIn: boolean;
  recordId?: string;
  clockInAt?: string;
  clockOutAt?: string;
  workDate?: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: string | null;
  status: string;
  notes: string | null;
}

interface Responsibility {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
}

interface Goal {
  id: string;
  title: string;
  status: string;
  progress: number;
  endDate: string | null;
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

const GOAL_COLORS: Record<string, string> = {
  ACTIVE: 'bg-blue-100 text-blue-700',
  ACHIEVED: 'bg-green-100 text-green-700',
  MISSED: 'bg-red-100 text-red-700',
  PAUSED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function MyAttendancePage() {
  const queryClient = useQueryClient();
  const [clockError, setClockError] = useState<string | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery<ClockStatus>({
    queryKey: ['my-clock-status'],
    queryFn: async () => {
      const res = await api().get('/attendance/me/status');
      return ((res.data as any)?.data ?? res.data) as ClockStatus;
    },
    refetchInterval: 30_000,
  });

  const { data: history = [] } = useQuery<AttendanceRecord[]>({
    queryKey: ['my-attendance-history'],
    queryFn: async () => {
      const res = await api().get('/attendance/me/history?limit=20');
      return ((res.data as any)?.data ?? res.data) as AttendanceRecord[];
    },
  });

  const { data: responsibilities = [] } = useQuery<Responsibility[]>({
    queryKey: ['my-responsibilities'],
    queryFn: async () => {
      const res = await api().get('/responsibilities/mine');
      return ((res.data as any)?.data ?? res.data) as Responsibility[];
    },
  });

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ['my-goals'],
    queryFn: async () => {
      const res = await api().get('/goals?limit=10&status=ACTIVE');
      return ((res.data as any)?.data ?? res.data) as Goal[];
    },
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      await api().post('/attendance/clock-in', {});
    },
    onSuccess: () => {
      setClockError(null);
      queryClient.invalidateQueries({ queryKey: ['my-clock-status'] });
      queryClient.invalidateQueries({ queryKey: ['my-attendance-history'] });
    },
    onError: (err: any) => {
      setClockError(err?.response?.data?.message ?? 'Clock-in failed');
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      await api().post('/attendance/clock-out', {});
    },
    onSuccess: () => {
      setClockError(null);
      queryClient.invalidateQueries({ queryKey: ['my-clock-status'] });
      queryClient.invalidateQueries({ queryKey: ['my-attendance-history'] });
    },
    onError: (err: any) => {
      setClockError(err?.response?.data?.message ?? 'Clock-out failed');
    },
  });

  const isWorking = clockInMutation.isPending || clockOutMutation.isPending;
  const isClockedIn = status?.isClockedIn ?? false;
  const isCompletedToday = !statusLoading && !isClockedIn && !!status?.clockOutAt;

  function handleClockAction() {
    setClockError(null);
    if (isClockedIn) {
      clockOutMutation.mutate();
    } else {
      clockInMutation.mutate();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
        <p className="text-sm text-gray-500 mt-1">Your clock status, responsibilities, and goals</p>
      </div>

      {/* Clock widget */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">
              {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            {statusLoading ? (
              <div className="h-8 w-32 bg-gray-100 rounded animate-pulse mt-1" />
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <span className={cn('w-2.5 h-2.5 rounded-full', isClockedIn ? 'bg-green-500 animate-pulse' : 'bg-gray-300')} />
                <p className="text-lg font-semibold text-gray-900">
                  {isCompletedToday ? 'Completed for today' : isClockedIn ? 'Clocked in' : 'Not clocked in'}
                </p>
              </div>
            )}
            {status?.clockInAt && (
              <p className="text-sm text-gray-500 mt-0.5">
                In: {new Date(status.clockInAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                {status.clockOutAt && ` · Out: ${new Date(status.clockOutAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {!isCompletedToday && (
              <button
                onClick={handleClockAction}
                disabled={isWorking || statusLoading}
                className={cn(
                  'flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition-all',
                  isClockedIn ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600',
                  (isWorking || statusLoading) && 'opacity-50 cursor-not-allowed',
                )}
              >
                {isClockedIn ? <LogOut size={18} /> : <LogIn size={18} />}
                {isWorking ? 'Please wait...' : isClockedIn ? 'Clock Out' : 'Clock In'}
              </button>
            )}
            {isCompletedToday && (
              <div className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm">
                <CheckCircle size={16} className="text-green-500" />
                Done for today
              </div>
            )}
            {clockError && (
              <div className="flex items-center gap-1.5 text-sm text-red-600">
                <AlertCircle size={14} />
                {clockError}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Responsibilities */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">My Responsibilities</h2>
          </div>
          {responsibilities.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No responsibilities assigned</p>
          ) : (
            <div className="space-y-2">
              {responsibilities.map((resp) => (
                <div key={resp.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{resp.title}</p>
                    {resp.description && <p className="text-xs text-gray-500 mt-0.5">{resp.description}</p>}
                    {resp.category && <p className="text-xs text-blue-500 mt-0.5">{resp.category}</p>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{resp.priority}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Goals */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">My Goals</h2>
          </div>
          {goals.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No active goals</p>
          ) : (
            <div className="space-y-3">
              {goals.map((goal) => (
                <div key={goal.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', GOAL_COLORS[goal.status] ?? 'bg-gray-100 text-gray-600')}>
                      {goal.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${goal.progress}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">{goal.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Attendance history */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Recent Attendance</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Clock In</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Clock Out</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Hours</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((rec) => (
              <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">{new Date(rec.date).toLocaleDateString('en-NG')}</td>
                <td className="px-4 py-3 text-gray-500">{rec.clockIn ? new Date(rec.clockIn).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{rec.clockOut ? new Date(rec.clockOut).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-4 py-3 text-gray-600">{rec.hoursWorked ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[rec.status] ?? 'bg-gray-100 text-gray-600')}>
                    {rec.status}
                  </span>
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No attendance records yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
