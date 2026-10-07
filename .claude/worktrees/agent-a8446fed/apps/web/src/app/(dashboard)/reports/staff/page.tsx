'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { Download } from 'lucide-react';

interface AttendanceData {
  summary: {
    present: number;
    absent: number;
    late: number;
    halfDay: number;
    leave: number;
    totalWorkingDays: number;
  };
  byEmployee: {
    employeeId: string;
    name: string;
    present: number;
    absent: number;
    late: number;
    hoursWorked: number;
  }[];
  daily: { date: string; present: number; absent: number; late: number }[];
}

function StaffReportContent() {
  const searchParams = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(searchParams.get('startDate') ?? monthStart);
  const [endDate, setEndDate] = useState(searchParams.get('endDate') ?? today);
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const queryParams = new URLSearchParams({ startDate, endDate });
  if (departmentId) queryParams.set('departmentId', departmentId);
  if (employeeId) queryParams.set('employeeId', employeeId);

  const { data: attendanceRes, isLoading } = useQuery<{ data: AttendanceData }>({
    queryKey: ['reports-staff-attendance', startDate, endDate, departmentId, employeeId],
    queryFn: () =>
      api()
        .get<{ data: AttendanceData }>(`/reports/staff/attendance?${queryParams}`)
        .then(r => r.data),
  });

  const attendance = attendanceRes?.data;
  const summary = attendance?.summary;
  const byEmployee = attendance?.byEmployee ?? [];

  async function handleExport() {
    const url = `/reports/staff/export?startDate=${startDate}&endDate=${endDate}&format=csv&type=attendance`;
    const res = await api().get(url, { responseType: 'blob' });
    const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'staff-attendance-export.csv';
    a.click();
  }

  function attendanceRate(emp: (typeof byEmployee)[0]): string {
    const total = emp.present + emp.absent + emp.late;
    if (total === 0) return '—';
    return `${Math.round(((emp.present + emp.late) / total) * 100)}%`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Staff Report</h1>
        <div className="flex gap-2">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-indigo-700"
          >
            <Download size={15} />
            Export
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Present', value: summary?.present ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Absent', value: summary?.absent ?? 0, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Late', value: summary?.late ?? 0, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Half Day', value: summary?.halfDay ?? 0, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Leave', value: summary?.leave ?? 0, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Total Days', value: summary?.totalWorkingDays ?? 0, color: 'text-gray-900', bg: 'bg-gray-50' },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-xl border border-gray-200 p-4 ${kpi.bg}`}>
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* By Employee Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">By Employee</h3>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Employee</th>
                  <th className="pb-2 font-medium text-right">Present</th>
                  <th className="pb-2 font-medium text-right">Absent</th>
                  <th className="pb-2 font-medium text-right">Late</th>
                  <th className="pb-2 font-medium text-right">Hours Worked</th>
                  <th className="pb-2 font-medium text-right">Attendance Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byEmployee.map(emp => (
                  <tr key={emp.employeeId} className="hover:bg-gray-50">
                    <td className="py-2.5 font-medium text-gray-900">{emp.name}</td>
                    <td className="py-2.5 text-right text-emerald-600">{emp.present}</td>
                    <td className="py-2.5 text-right text-red-600">{emp.absent}</td>
                    <td className="py-2.5 text-right text-amber-600">{emp.late}</td>
                    <td className="py-2.5 text-right">{emp.hoursWorked.toFixed(1)}h</td>
                    <td className="py-2.5 text-right">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                        {attendanceRate(emp)}
                      </span>
                    </td>
                  </tr>
                ))}
                {byEmployee.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">
                      No attendance data for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Daily breakdown */}
      {(attendance?.daily ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Daily Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium text-right">Present</th>
                  <th className="pb-2 font-medium text-right">Absent</th>
                  <th className="pb-2 font-medium text-right">Late</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(attendance?.daily ?? []).map(day => (
                  <tr key={day.date} className="hover:bg-gray-50">
                    <td className="py-2.5">{day.date}</td>
                    <td className="py-2.5 text-right text-emerald-600">{day.present}</td>
                    <td className="py-2.5 text-right text-red-600">{day.absent}</td>
                    <td className="py-2.5 text-right text-amber-600">{day.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StaffReportPage() {
  return (
    <Suspense fallback={<div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />}>
      <StaffReportContent />
    </Suspense>
  );
}
