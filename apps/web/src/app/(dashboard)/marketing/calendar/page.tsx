'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ScheduledDraft {
  id: string;
  title: string;
  status: string;
  targetChannel: string;
  scheduledAt: string;
  campaign: { id: string; name: string } | null;
}

const CHANNEL_COLORS: Record<string, string> = {
  EMAIL: 'bg-blue-100 text-blue-700',
  SMS: 'bg-green-100 text-green-700',
  SOCIAL: 'bg-purple-100 text-purple-700',
  WEB_PUSH: 'bg-orange-100 text-orange-700',
  WHATSAPP: 'bg-teal-100 text-teal-700',
  TELEGRAM: 'bg-sky-100 text-sky-700',
  STOREFRONT: 'bg-pink-100 text-pink-700',
  IN_APP: 'bg-gray-100 text-gray-700',
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

export default function MarketingCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const weekStart = startOfWeek(currentDate);
  const weekEnd = addDays(weekStart, 6);

  const { data: drafts, isLoading } = useQuery<ScheduledDraft[]>({
    queryKey: ['marketing-calendar', weekStart.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: addDays(weekEnd, 1).toISOString(),
      });
      const res = await api().get<ScheduledDraft[]>(`/marketing/calendar?${params}`);
      return res.data;
    },
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const draftsByDay = (date: Date) =>
    (drafts ?? []).filter((d) => {
      const s = new Date(d.scheduledAt);
      return (
        s.getFullYear() === date.getFullYear() &&
        s.getMonth() === date.getMonth() &&
        s.getDate() === date.getDate()
      );
    });

  const today = new Date();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Content Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate((d) => addDays(d, -7))}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ChevronLeft size={18} className="text-gray-500" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-40 text-center">
            {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
            {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button
            onClick={() => setCurrentDate((d) => addDays(d, 7))}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ChevronRight size={18} className="text-gray-500" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
          >
            Today
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading calendar...</div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const isToday =
              day.getFullYear() === today.getFullYear() &&
              day.getMonth() === today.getMonth() &&
              day.getDate() === today.getDate();
            const dayDrafts = draftsByDay(day);

            return (
              <div key={day.toISOString()} className="min-h-32">
                <div className={cn(
                  'text-center py-1.5 rounded-t-lg text-xs font-medium mb-1',
                  isToday ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600',
                )}>
                  <p>{day.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                  <p className="text-base font-bold">{day.getDate()}</p>
                </div>

                <div className="space-y-1">
                  {dayDrafts.map((draft) => (
                    <Link
                      key={draft.id}
                      href={`/marketing/content/${draft.id}`}
                      className={cn(
                        'block px-2 py-1.5 rounded text-xs font-medium truncate',
                        CHANNEL_COLORS[draft.targetChannel] ?? 'bg-gray-100 text-gray-600',
                      )}
                      title={`${draft.title} (${draft.targetChannel})`}
                    >
                      {draft.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && (drafts ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-gray-200">
          <Calendar size={32} className="text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">No content scheduled this week</p>
          <Link href="/marketing/content/new" className="mt-2 text-xs text-blue-600 hover:underline">
            Create and schedule content
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        {Object.entries(CHANNEL_COLORS).map(([ch, color]) => (
          <span key={ch} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', color)}>{ch}</span>
        ))}
      </div>
    </div>
  );
}
