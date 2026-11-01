'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Clock,
  MapPin,
  Users,
  RefreshCw,
  Loader2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

interface CalendarConnection {
  id: string;
  provider: string;
  calendarId: string | null;
  calendarName: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  isAllDay: boolean;
  status: string;
  provider: string;
  htmlLink: string | null;
}

interface CreateEventForm {
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  timezone: string;
  isAllDay: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateEventForm>({
    title: '',
    description: '',
    location: '',
    startAt: new Date().toISOString().slice(0, 16),
    endAt: new Date(Date.now() + 3600_000).toISOString().slice(0, 16),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isAllDay: false,
  });

  const { data: connectionsData } = useQuery({
    queryKey: ['calendar-connections'],
    queryFn: () => api().get('/calendar/connections').then((r) => r.data),
  });
  const connections: CalendarConnection[] = connectionsData ?? [];
  const activeConnection = connections.find((c) => c.isActive);
  const connectionId = selectedConnectionId ?? activeConnection?.id ?? null;

  // Time window for current view
  const { timeMin, timeMax } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    if (viewMode === 'month') {
      return {
        timeMin: new Date(year, month, 1).toISOString(),
        timeMax: new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
      };
    }
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    return { timeMin: startOfWeek.toISOString(), timeMax: endOfWeek.toISOString() };
  }, [currentDate, viewMode]);

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['calendar-events', timeMin, timeMax],
    queryFn: () =>
      api().get('/calendar/events', { params: { timeMin, timeMax } }).then((r) => r.data.data),
    enabled: true,
  });
  const events: CalendarEvent[] = eventsData ?? [];

  const syncMutation = useMutation({
    mutationFn: (connId: string) => api().post(`/calendar/events/sync/${connId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateEventForm & { connectionId: string }) =>
      api().post(`/calendar/events/${data.connectionId}`, data),
    onSuccess: () => {
      setShowCreateForm(false);
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => api().delete(`/calendar/events/${eventId}`),
    onSuccess: () => {
      setSelectedEvent(null);
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    },
  });

  const navigate = (dir: -1 | 1) => {
    setCurrentDate((d) => {
      const next = new Date(d);
      if (viewMode === 'month') next.setMonth(d.getMonth() + dir);
      else if (viewMode === 'week') next.setDate(d.getDate() + dir * 7);
      else next.setDate(d.getDate() + dir);
      return next;
    });
  };

  const viewLabel = useMemo(() => {
    if (viewMode === 'month') return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (viewMode === 'week') {
      const start = new Date(currentDate);
      start.setDate(currentDate.getDate() - currentDate.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    }
    return currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, [currentDate, viewMode]);

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (Date | null)[] = Array(firstDay).fill(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  }, [currentDate]);

  const getEventsForDay = (day: Date) =>
    events.filter((e) => {
      const start = new Date(e.startAt);
      return start.toDateString() === day.toDateString();
    });

  const providerLabel = (p: string) => ({ google: 'Google Calendar', microsoft: 'Microsoft Outlook' }[p] ?? p);
  const providerColor = (p: string) => ({ google: 'bg-blue-500', microsoft: 'bg-indigo-500' }[p] ?? 'bg-gray-500');

  if (connections.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center py-16">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No calendar connected</h2>
          <p className="text-gray-500 mb-6">Connect your Google or Microsoft calendar to get started.</p>
          <a
            href="/calendar/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus size={16} />
            Connect Calendar
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-gray-100">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-sm font-medium rounded hover:bg-gray-100"
            >
              Today
            </button>
            <button onClick={() => navigate(1)} className="p-1.5 rounded hover:bg-gray-100">
              <ChevronRight size={18} />
            </button>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{viewLabel}</h2>
        </div>

        <div className="flex items-center gap-3">
          {/* View selector */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(['month', 'week', 'day', 'agenda'] as CalendarViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={cn(
                  'px-3 py-1.5 capitalize',
                  viewMode === v ? 'bg-blue-600 text-white' : 'hover:bg-gray-50 text-gray-600',
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Connection selector */}
          {connections.length > 1 && (
            <select
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
              value={connectionId ?? ''}
              onChange={(e) => setSelectedConnectionId(e.target.value || null)}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {providerLabel(c.provider)} — {c.calendarName ?? c.calendarId ?? 'Primary'}
                </option>
              ))}
            </select>
          )}

          {/* Sync */}
          {connectionId && (
            <button
              onClick={() => syncMutation.mutate(connectionId)}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              {syncMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sync
            </button>
          )}

          {/* Create event */}
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            New Event
          </button>
        </div>
      </div>

      {/* Calendar grid — month view */}
      {viewMode === 'month' && (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
            {DAYS.map((d) => (
              <div key={d} className="bg-gray-50 px-2 py-2 text-xs font-semibold text-gray-500 text-center">
                {d}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const dayEvents = day ? getEventsForDay(day) : [];
              const isToday = day?.toDateString() === new Date().toDateString();
              return (
                <div
                  key={i}
                  className={cn('bg-white min-h-[100px] p-1.5', !day && 'bg-gray-50')}
                >
                  {day && (
                    <>
                      <span
                        className={cn(
                          'text-sm font-medium inline-flex items-center justify-center w-7 h-7 rounded-full',
                          isToday ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100',
                        )}
                      >
                        {day.getDate()}
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <button
                            key={e.id}
                            onClick={() => setSelectedEvent(e)}
                            className={cn(
                              'w-full text-left text-xs px-1.5 py-0.5 rounded truncate text-white',
                              providerColor(e.provider),
                            )}
                          >
                            {e.isAllDay ? '' : new Date(e.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' '}
                            {e.title}
                          </button>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-xs text-gray-400 px-1">+{dayEvents.length - 3} more</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agenda view */}
      {viewMode === 'agenda' && (
        <div className="flex-1 overflow-auto p-6">
          {eventsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No events in this period</div>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedEvent(e)}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('w-1 self-stretch rounded-full', providerColor(e.provider))} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{e.title}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {e.isAllDay ? 'All day' : `${new Date(e.startAt).toLocaleString()} – ${new Date(e.endAt).toLocaleTimeString()}`}
                        </span>
                        {e.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={11} />
                            {e.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Week / Day views — simplified list */}
      {(viewMode === 'week' || viewMode === 'day') && (
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No events</div>
            ) : (
              events.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedEvent(e)}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300"
                >
                  <p className="font-medium text-sm text-gray-900">{e.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(e.startAt).toLocaleDateString()} · {e.isAllDay ? 'All day' : new Date(e.startAt).toLocaleTimeString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Event detail modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSelectedEvent(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <button onClick={() => setSelectedEvent(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <div className={cn('w-3 h-3 rounded-full', providerColor(selectedEvent.provider))} />
              <span className="text-xs text-gray-500">{providerLabel(selectedEvent.provider)}</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">{selectedEvent.title}</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Clock size={14} className="flex-shrink-0" />
                <span>
                  {selectedEvent.isAllDay
                    ? `All day · ${new Date(selectedEvent.startAt).toLocaleDateString()}`
                    : `${new Date(selectedEvent.startAt).toLocaleString()} – ${new Date(selectedEvent.endAt).toLocaleTimeString()}`}
                </span>
              </div>
              {selectedEvent.location && (
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="flex-shrink-0" />
                  <span>{selectedEvent.location}</span>
                </div>
              )}
              {selectedEvent.description && (
                <p className="mt-2 text-gray-600 text-sm">{selectedEvent.description}</p>
              )}
            </div>
            <div className="mt-6 flex gap-2">
              {selectedEvent.htmlLink && (
                <a
                  href={selectedEvent.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Open in {providerLabel(selectedEvent.provider)}
                </a>
              )}
              <button
                onClick={() => deleteMutation.mutate(selectedEvent.id)}
                disabled={deleteMutation.isPending}
                className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create event modal */}
      {showCreateForm && connectionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowCreateForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <button onClick={() => setShowCreateForm(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Event</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                  <input
                    type="datetime-local"
                    value={createForm.startAt}
                    onChange={(e) => setCreateForm((f) => ({ ...f, startAt: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                  <input
                    type="datetime-local"
                    value={createForm.endAt}
                    onChange={(e) => setCreateForm((f) => ({ ...f, endAt: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location (optional)</label>
                <input
                  type="text"
                  value={createForm.location}
                  onChange={(e) => setCreateForm((f) => ({ ...f, location: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setShowCreateForm(false)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate({ ...createForm, connectionId })}
                disabled={createMutation.isPending || !createForm.title}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
