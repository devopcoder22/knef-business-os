import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

export interface PlanProgress {
  planId: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  progressPercent: number;
  goalProgress: number | null;
  kpis: Array<{ name: string; target: number; current: number; unit: string | null; percent: number }>;
  deadlineStatus: 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'COMPLETED';
  upcomingDeadlines: Array<{ title: string; dueDate: string }>;
}

@Injectable()
export class PlanProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async getProgress(organizationId: string, planId: string): Promise<PlanProgress> {
    const plan = await this.prisma.plan.findFirst({
      where: { id: planId, organizationId },
      include: { taskLinks: { where: { isProposed: false } } },
    });

    if (!plan) {
      return {
        planId,
        totalTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
        progressPercent: 0,
        goalProgress: null,
        kpis: [],
        deadlineStatus: 'ON_TRACK',
        upcomingDeadlines: [],
      };
    }

    const taskIds = plan.taskLinks
      .filter((l) => l.taskId !== null)
      .map((l) => l.taskId as string);

    let totalTasks = 0;
    let completedTasks = 0;
    let overdueTasks = 0;
    const upcomingDeadlines: Array<{ title: string; dueDate: string }> = [];

    if (taskIds.length > 0) {
      const now = new Date();
      const weekOut = new Date(Date.now() + 7 * 86400000);

      const tasks = await this.prisma.task.findMany({
        where: { id: { in: taskIds }, organizationId },
        select: { id: true, title: true, status: true, dueDate: true },
      });

      totalTasks = tasks.length;
      completedTasks = tasks.filter((t) => t.status === 'DONE').length;
      overdueTasks = tasks.filter(
        (t) => t.dueDate && t.dueDate < now && t.status !== 'DONE' && t.status !== 'CANCELLED',
      ).length;

      upcomingDeadlines.push(
        ...tasks
          .filter((t) => t.dueDate && t.dueDate >= now && t.dueDate <= weekOut && t.status !== 'DONE')
          .map((t) => ({ title: t.title, dueDate: t.dueDate!.toISOString() })),
      );
    }

    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Goal progress
    let goalProgress: number | null = null;
    let kpis: Array<{ name: string; target: number; current: number; unit: string | null; percent: number }> = [];

    if (plan.goalId) {
      try {
        const goal = await this.prisma.goal.findFirst({
          where: { id: plan.goalId, organizationId },
          include: { kpis: true },
        });
        if (goal) {
          goalProgress = goal.progress;
          kpis = goal.kpis.map((k) => ({
            name: k.name,
            target: Number(k.target),
            current: Number(k.current),
            unit: k.unit,
            percent: Number(k.target) > 0 ? Math.round((Number(k.current) / Number(k.target)) * 100) : 0,
          }));
        }
      } catch {
        // non-fatal
      }
    }

    // Deadline status
    let deadlineStatus: PlanProgress['deadlineStatus'] = 'ON_TRACK';
    if (plan.status === 'COMPLETED') {
      deadlineStatus = 'COMPLETED';
    } else if (plan.targetDate && plan.targetDate < new Date()) {
      deadlineStatus = progressPercent < 100 ? 'OVERDUE' : 'COMPLETED';
    } else if (plan.targetDate) {
      const daysRemaining = Math.floor((plan.targetDate.getTime() - Date.now()) / 86400000);
      const expectedProgress = 100 - (daysRemaining / 30) * 20; // rough heuristic
      if (progressPercent < expectedProgress - 20 && overdueTasks > 0) {
        deadlineStatus = 'AT_RISK';
      }
    }

    return {
      planId,
      totalTasks,
      completedTasks,
      overdueTasks,
      progressPercent,
      goalProgress,
      kpis,
      deadlineStatus,
      upcomingDeadlines,
    };
  }
}
