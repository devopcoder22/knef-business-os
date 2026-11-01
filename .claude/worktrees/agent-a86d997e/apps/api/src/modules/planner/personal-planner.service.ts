import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AICompletionService } from '../ai/ai-completion.service';
import { AIPermissionCheckerService } from '../ai-actions/ai-permission-checker.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { ListCalendarEventsDto } from '../calendar/dto/list-events.dto';
import { PERMISSIONS } from '@knef/constants';

const PERSONAL_PLANNER_SYSTEM_PROMPT = `You are KNEF AI Personal Planner. Your role is to help individual users plan their day and week effectively by combining their calendar, tasks, goals, and business context.

Rules:
- Only use data explicitly provided in the context.
- Never fabricate tasks, events, or metrics.
- Be concise and action-oriented.
- Use HTML formatting for Telegram compatibility.
- Present times in Nigerian time (WAT, UTC+1).
- When you cannot determine availability (e.g., no calendar integration), say so clearly.
- Keep responses under 400 words unless explicitly asked for more detail.`;

const PLANNER_CHAT_SYSTEM_PROMPT = `You are KNEF AI, a business planning assistant. You help users understand and manage their plans, tasks, goals, and calendar.

Rules:
- Only reference data explicitly provided in the context.
- Never invent task statuses, dates, or business metrics.
- When asked to take an action (create task, move deadline), describe what you would do — the user must confirm before any changes are made.
- Use Nigerian Naira (₦) for monetary values.
- Keep responses concise and professional.`;

// Minimal shape of a calendar event as returned by getCachedEvents
interface CalendarEventRecord {
  title: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  location?: string | null;
  isAllDay: boolean;
  status: string;
}

@Injectable()
export class PersonalPlannerService {
  private readonly logger = new Logger(PersonalPlannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiCompletion: AICompletionService,
    private readonly permissionChecker: AIPermissionCheckerService,
    private readonly calendarEventsService: CalendarEventsService,
  ) {}

  async buildDailyPlan(organizationId: string, userId: string, date?: string): Promise<string> {
    const targetDate = date ? new Date(date) : new Date();
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const ctx = await this.permissionChecker.resolveExecutionContext(userId, organizationId);
    const perms = new Set(ctx.resolvedPermissions);
    const sections: string[] = [];
    const dateStr = targetDate.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    sections.push(`DATE: ${dateStr}`);

    let dueToday: Array<{ title: string; priority: string }> = [];

    if (perms.has(PERMISSIONS.TASKS.VIEW)) {
      const [overdue, todayTasks, upcoming] = await Promise.all([
        this.prisma.task.findMany({
          where: {
            organizationId,
            assigneeId: userId,
            status: { notIn: ['DONE', 'CANCELLED'] },
            dueDate: { lt: dayStart },
          },
          select: { id: true, title: true, priority: true, dueDate: true },
          orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
          take: 5,
        }),
        this.prisma.task.findMany({
          where: {
            organizationId,
            assigneeId: userId,
            status: { notIn: ['DONE', 'CANCELLED'] },
            dueDate: { gte: dayStart, lte: dayEnd },
          },
          select: { id: true, title: true, priority: true, dueDate: true },
          orderBy: [{ priority: 'desc' }],
          take: 10,
        }),
        this.prisma.task.count({
          where: {
            organizationId,
            assigneeId: userId,
            status: { notIn: ['DONE', 'CANCELLED'] },
            dueDate: { gt: dayEnd, lte: new Date(dayEnd.getTime() + 7 * 86400000) },
          },
        }),
      ]);

      dueToday = todayTasks;
      sections.push(`TASKS OVERDUE (${overdue.length}): ${overdue.map((t) => t.title).join('; ') || 'none'}`);
      sections.push(`TASKS DUE TODAY (${todayTasks.length}): ${todayTasks.map((t) => `${t.title} [${t.priority}]`).join('; ') || 'none'}`);
      sections.push(`TASKS UPCOMING (7 days): ${upcoming}`);
    }

    if (perms.has(PERMISSIONS.GOALS.VIEW)) {
      const goals = await this.prisma.goal.findMany({
        where: { organizationId, ownerId: userId, status: 'ACTIVE' },
        select: { title: true, progress: true, endDate: true },
        take: 3,
      });
      if (goals.length > 0) {
        sections.push(`ACTIVE GOALS: ${goals.map((g) => `"${g.title}" ${g.progress}%`).join('; ')}`);
      }
    }

    // Calendar (from service cache — enforces org+user isolation)
    if (perms.has(PERMISSIONS.CALENDAR.VIEW)) {
      try {
        const query = new ListCalendarEventsDto();
        query.timeMin = dayStart.toISOString();
        query.timeMax = dayEnd.toISOString();
        query.limit = 15;
        const { data: events } = await this.calendarEventsService.getCachedEvents(organizationId, userId, query);
        const calendarSection = this.formatCalendarContext(
          events as CalendarEventRecord[],
          dayStart,
          dayEnd,
          'daily',
          dueToday.length,
        );
        sections.push(calendarSection);
      } catch {
        sections.push('CALENDAR EVENTS: unavailable');
      }
    }

    // Active plans
    const activePlans = await this.prisma.plan.findMany({
      where: { organizationId, ownerId: userId, status: { in: ['ACTIVE', 'APPROVED'] } },
      select: { title: true, status: true },
      take: 3,
    });
    if (activePlans.length > 0) {
      sections.push(`ACTIVE PLANS: ${activePlans.map((p) => p.title).join('; ')}`);
    }

    const contextPrompt = `${sections.join('\n\n')}\n\nGenerate a concise, actionable daily plan summary. Use HTML formatting. Include: greeting, today's focus areas, top 3 priorities, calendar highlights, and one key recommendation. Do not invent any data not in the context above.`;

    try {
      const result = await this.aiCompletion.complete({
        organizationId,
        userId,
        taskType: 'planner_daily',
        systemPrompt: PERSONAL_PLANNER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contextPrompt }],
        maxTokens: 600,
        temperature: 0.4,
      });
      return result.content;
    } catch (err) {
      this.logger.error('Daily plan generation failed', err);
      return this.buildFallbackDailyPlan(sections, dateStr);
    }
  }

  async buildWeeklyPlan(organizationId: string, userId: string, weekStart?: string): Promise<string> {
    const monday = weekStart ? new Date(weekStart) : this.getMonday(new Date());
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    sunday.setHours(23, 59, 59, 999);

    const ctx = await this.permissionChecker.resolveExecutionContext(userId, organizationId);
    const perms = new Set(ctx.resolvedPermissions);
    const sections: string[] = [];

    sections.push(`WEEK: ${monday.toLocaleDateString('en-NG')} to ${sunday.toLocaleDateString('en-NG')}`);

    if (perms.has(PERMISSIONS.TASKS.VIEW)) {
      const [overdue, dueThisWeek] = await Promise.all([
        this.prisma.task.count({
          where: { organizationId, assigneeId: userId, status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lt: monday } },
        }),
        this.prisma.task.findMany({
          where: { organizationId, assigneeId: userId, status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { gte: monday, lte: sunday } },
          select: { title: true, priority: true, dueDate: true },
          orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
          take: 15,
        }),
      ]);
      sections.push(`OVERDUE TASKS: ${overdue}`);
      sections.push(`TASKS DUE THIS WEEK (${dueThisWeek.length}): ${dueThisWeek.map((t) => `${t.title} [${t.priority}]`).join('; ') || 'none'}`);
    }

    if (perms.has(PERMISSIONS.GOALS.VIEW)) {
      const goals = await this.prisma.goal.findMany({
        where: { organizationId, ownerId: userId, status: 'ACTIVE' },
        include: { kpis: { take: 3 } },
        take: 3,
      });
      if (goals.length > 0) {
        sections.push(
          `GOALS: ${goals.map((g) => `"${g.title}" ${g.progress}%${g.kpis.length > 0 ? ` | KPIs: ${g.kpis.map((k) => k.name).join(',')}` : ''}`).join('; ')}`,
        );
      }
    }

    if (perms.has(PERMISSIONS.CALENDAR.VIEW)) {
      try {
        const query = new ListCalendarEventsDto();
        query.timeMin = monday.toISOString();
        query.timeMax = sunday.toISOString();
        query.limit = 15;
        const { data: events } = await this.calendarEventsService.getCachedEvents(organizationId, userId, query);
        const calendarSection = this.formatCalendarContext(
          events as CalendarEventRecord[],
          monday,
          sunday,
          'weekly',
          0,
        );
        sections.push(calendarSection);
      } catch {
        // non-fatal
      }
    }

    const contextPrompt = `${sections.join('\n\n')}\n\nGenerate a weekly plan overview. Include: week focus areas, key priorities, deadline highlights, risks. Use HTML formatting. Do not invent data.`;

    try {
      const result = await this.aiCompletion.complete({
        organizationId,
        userId,
        taskType: 'planner_weekly',
        systemPrompt: PERSONAL_PLANNER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contextPrompt }],
        maxTokens: 700,
        temperature: 0.4,
      });
      return result.content;
    } catch (err) {
      this.logger.error('Weekly plan generation failed', err);
      return `<b>Week of ${monday.toLocaleDateString('en-NG')}</b>\n\n${sections.join('\n')}`;
    }
  }

  async askPlanner(
    organizationId: string,
    userId: string,
    message: string,
    planId?: string,
  ): Promise<string> {
    const ctx = await this.permissionChecker.resolveExecutionContext(userId, organizationId);
    const perms = new Set(ctx.resolvedPermissions);
    const context: string[] = [];

    if (planId) {
      const plan = await this.prisma.plan.findFirst({
        where: { id: planId, organizationId },
        include: {
          steps: { select: { title: true, status: true }, orderBy: { sortOrder: 'asc' } },
          taskLinks: { select: { isProposed: true, taskId: true } },
        },
      });

      if (plan) {
        const executedTasks = plan.taskLinks.filter((l) => !l.isProposed).length;
        const proposedTasks = plan.taskLinks.filter((l) => l.isProposed).length;
        context.push(
          `PLAN: "${plan.title}" — status: ${plan.status}, objective: ${plan.objective ?? 'N/A'}`,
          `STEPS: ${plan.steps.map((s) => `"${s.title}" [${s.status}]`).join('; ')}`,
          `TASKS: ${executedTasks} created, ${proposedTasks} proposed`,
        );
      }
    }

    if (perms.has(PERMISSIONS.TASKS.VIEW)) {
      const overdue = await this.prisma.task.count({
        where: {
          organizationId,
          assigneeId: userId,
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { lt: new Date() },
        },
      });
      context.push(`USER OVERDUE TASKS: ${overdue}`);
    }

    // Calendar context for today when user has permission
    if (perms.has(PERMISSIONS.CALENDAR.VIEW)) {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const query = new ListCalendarEventsDto();
        query.timeMin = todayStart.toISOString();
        query.timeMax = todayEnd.toISOString();
        query.limit = 15;
        const { data: events } = await this.calendarEventsService.getCachedEvents(organizationId, userId, query);
        if (events.length > 0) {
          const calSection = this.formatCalendarContext(
            events as CalendarEventRecord[],
            todayStart,
            todayEnd,
            'daily',
            0,
          );
          context.push(calSection);
        }
      } catch {
        // non-fatal — calendar context is optional for chat
      }
    }

    const activePlans = await this.prisma.plan.findMany({
      where: { organizationId, ownerId: userId, status: { in: ['ACTIVE', 'APPROVED', 'REVIEW'] } },
      select: { id: true, title: true, status: true },
      take: 5,
    });
    if (activePlans.length > 0) {
      context.push(`USER PLANS: ${activePlans.map((p) => `"${p.title}" [${p.status}]`).join('; ')}`);
    }

    const prompt = `${context.length > 0 ? 'CONTEXT:\n' + context.join('\n') + '\n\n' : ''}User question: ${message}`;

    try {
      const result = await this.aiCompletion.complete({
        organizationId,
        userId,
        taskType: 'planner_chat',
        systemPrompt: PLANNER_CHAT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 500,
        temperature: 0.3,
      });
      return result.content;
    } catch {
      return '⚠️ Unable to process your planning request. Please try again.';
    }
  }

  /**
   * Formats calendar events into a structured context string for the AI.
   * Never includes attendee lists or private event descriptions — only title, time, timezone, location.
   */
  private formatCalendarContext(
    events: CalendarEventRecord[],
    rangeStart: Date,
    rangeEnd: Date,
    mode: 'daily' | 'weekly',
    dueTodayCount = 0,
  ): string {
    if (events.length === 0) {
      return mode === 'daily'
        ? 'CALENDAR EVENTS: none cached (sync your calendar to see events)'
        : 'CALENDAR EVENTS THIS WEEK: none cached (sync your calendar to see events)';
    }

    const fmt = (d: Date, tz: string) =>
      d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: tz || 'Africa/Lagos', hour12: false });

    if (mode === 'daily') {
      const lines: string[] = [];
      let totalMeetingMs = 0;

      // Sort by startAt
      const sorted = [...events].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

      for (const event of sorted) {
        const tz = event.timezone || 'Africa/Lagos';
        const start = fmt(event.startAt, tz);
        const end = fmt(event.endAt, tz);
        const location = event.location ? ` [${event.location}]` : '';
        lines.push(`${start}–${end} ${event.title}${location} [${tz}]`);
        totalMeetingMs += event.endAt.getTime() - event.startAt.getTime();
      }

      const totalMeetingHours = totalMeetingMs / 3600000;

      // Free block analysis: gaps between events > 30 min
      const freeBlocks: string[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const gapMs = sorted[i + 1].startAt.getTime() - sorted[i].endAt.getTime();
        if (gapMs >= 30 * 60 * 1000) {
          const tz = sorted[i].timezone || 'Africa/Lagos';
          const blockStart = fmt(sorted[i].endAt, tz);
          const blockEnd = fmt(sorted[i + 1].startAt, tz);
          const blockHours = Math.round(gapMs / 36000) / 100;
          freeBlocks.push(`${blockStart}–${blockEnd} (${blockHours}h free)`);
        }
      }

      let section = `CALENDAR EVENTS (${events.length}):\n${lines.join('\n')}`;
      if (freeBlocks.length > 0) {
        section += `\nFREE BLOCKS: ${freeBlocks.join('; ')}`;
      }
      section += `\nMEETING LOAD: ${totalMeetingHours.toFixed(1)}h`;

      if (totalMeetingHours > 4 && dueTodayCount > 0) {
        section += `\nCONFLICT: Heavy meeting day (${totalMeetingHours.toFixed(1)}h) with ${dueTodayCount} task(s) due today — consider rescheduling low-priority tasks`;
      }

      return section;
    } else {
      // Weekly mode: group by day of week
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const byDay = new Map<number, CalendarEventRecord[]>();

      for (const event of events) {
        const day = event.startAt.getDay();
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push(event);
      }

      const lines: string[] = [`CALENDAR EVENTS THIS WEEK (${events.length} total):`];

      // Iterate Mon-Sun
      for (let d = 1; d <= 7; d++) {
        const dayIdx = d % 7; // 1=Mon..6=Sat, 0=Sun
        const dayEvents = byDay.get(dayIdx);
        if (!dayEvents || dayEvents.length === 0) continue;

        const sorted = [...dayEvents].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
        const dayName = dayNames[dayIdx];
        const evtSummary = sorted
          .map((e) => {
            const tz = e.timezone || 'Africa/Lagos';
            const start = fmt(e.startAt, tz);
            const location = e.location ? ` [${e.location}]` : '';
            return `${start} ${e.title}${location}`;
          })
          .join(', ');

        lines.push(`${dayName} (${sorted.length}): ${evtSummary}`);
      }

      return lines.join('\n');
    }
  }

  private getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private buildFallbackDailyPlan(sections: string[], dateStr: string): string {
    return `<b>📋 Daily Plan — ${dateStr}</b>\n\n${sections.join('\n\n')}`;
  }
}
