import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AICompletionService } from '../ai/ai-completion.service';
import { AIPermissionCheckerService } from '../ai-actions/ai-permission-checker.service';
import { PERMISSIONS } from '@knef/constants';
import type { GeneratePlanDto } from './dto/planner.dto';

const PLAN_GENERATOR_SYSTEM_PROMPT = `You are KNEF AI Planner, an intelligent business planning assistant for KNEF Gadgets, a Nigerian electronics retailer.

Your role is to take high-level instructions and generate structured, actionable plans.

Output ONLY valid JSON matching this exact schema — no prose, no markdown fences:

{
  "title": "string",
  "objective": "string",
  "assumptions": ["string"],
  "expectedOutcomes": ["string"],
  "startDate": "YYYY-MM-DD or null",
  "targetDate": "YYYY-MM-DD or null",
  "steps": [
    {
      "title": "string",
      "objective": "string",
      "sortOrder": 0,
      "startDate": "YYYY-MM-DD or null",
      "targetDate": "YYYY-MM-DD or null",
      "kpiName": "string or null",
      "kpiTarget": "string or null",
      "kpiUnit": "string or null",
      "tasks": [
        {
          "title": "string",
          "description": "string",
          "priority": "LOW|MEDIUM|HIGH|URGENT",
          "estimatedHours": 4,
          "dueDate": "YYYY-MM-DD or null",
          "dependsOn": "task title this depends on, or null"
        }
      ]
    }
  ],
  "kpis": [
    {
      "name": "string",
      "target": "string",
      "unit": "NGN|%|count|string"
    }
  ],
  "risks": ["string"],
  "warnings": ["string"]
}

Rules:
- Use Nigerian Naira (₦) for all monetary values; format targets as plain numbers.
- Only use data explicitly provided in the context section.
- If business data is absent, mark assumptions clearly in the "assumptions" array.
- Never invent sales figures, customer counts, or inventory data.
- Keep the plan realistic — do not create an unachievable number of tasks.
- Limit steps to 5 or fewer unless the instruction clearly requires more.
- Tasks per step: 3–6 maximum.
- If the plan affects financial records, purchasing, or customer data, add a warning in "warnings".
- Today's date is provided in the context.`;

export interface GeneratedPlanJson {
  title: string;
  objective: string;
  assumptions: string[];
  expectedOutcomes: string[];
  startDate: string | null;
  targetDate: string | null;
  steps: Array<{
    title: string;
    objective: string;
    sortOrder: number;
    startDate: string | null;
    targetDate: string | null;
    kpiName: string | null;
    kpiTarget: string | null;
    kpiUnit: string | null;
    tasks: Array<{
      title: string;
      description: string;
      priority: string;
      estimatedHours: number;
      dueDate: string | null;
      dependsOn: string | null;
    }>;
  }>;
  kpis: Array<{ name: string; target: string; unit: string }>;
  risks: string[];
  warnings: string[];
}

@Injectable()
export class PlanGeneratorService {
  private readonly logger = new Logger(PlanGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiCompletion: AICompletionService,
    private readonly permissionChecker: AIPermissionCheckerService,
  ) {}

  async generate(
    organizationId: string,
    userId: string,
    planId: string,
    dto: GeneratePlanDto,
  ): Promise<{ plan: unknown; preview: GeneratedPlanJson }> {
    const context = await this.buildContext(organizationId, userId, dto);

    const userMessage = `Today: ${new Date().toISOString().split('T')[0]}

INSTRUCTION: ${dto.instruction}
${dto.context ? `\nADDITIONAL CONTEXT: ${dto.context}` : ''}
${dto.targetDate ? `\nTARGET DATE: ${dto.targetDate}` : ''}
${context ? `\nBUSINESS CONTEXT:\n${context}` : '\nBUSINESS CONTEXT: (not provided — use assumptions)'}`;

    let rawContent: string;
    try {
      const result = await this.aiCompletion.complete({
        organizationId,
        userId,
        taskType: 'planner_generate',
        systemPrompt: PLAN_GENERATOR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 2000,
        temperature: 0.3,
      });
      rawContent = result.content;
    } catch (err) {
      this.logger.error('AI plan generation failed', err);
      throw err;
    }

    let generated: GeneratedPlanJson;
    try {
      // Strip markdown fences if present
      const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      generated = JSON.parse(cleaned) as GeneratedPlanJson;
    } catch {
      throw new Error('AI returned invalid JSON for plan generation. Please try again.');
    }

    // Persist the generated plan content
    const updatedPlan = await this.prisma.plan.update({
      where: { id: planId },
      data: {
        title: generated.title,
        objective: generated.objective,
        startDate: generated.startDate ? new Date(generated.startDate) : null,
        targetDate: generated.targetDate ? new Date(generated.targetDate) : null,
        status: 'REVIEW',
        metadata: {
          assumptions: generated.assumptions,
          expectedOutcomes: generated.expectedOutcomes,
          kpis: generated.kpis,
          risks: generated.risks,
          warnings: generated.warnings,
        } as Prisma.InputJsonValue,
        previewData: generated as unknown as Prisma.InputJsonValue,
      },
    });

    // Create PlanStep records from the generated steps
    if (generated.steps.length > 0) {
      await this.prisma.planStep.createMany({
        data: generated.steps.map((step, idx) => ({
          id: createId(),
          planId,
          title: step.title,
          objective: step.objective,
          sortOrder: step.sortOrder ?? idx,
          startDate: step.startDate ? new Date(step.startDate) : null,
          targetDate: step.targetDate ? new Date(step.targetDate) : null,
          kpiName: step.kpiName ?? null,
          kpiTarget: step.kpiTarget ?? null,
          kpiUnit: step.kpiUnit ?? null,
          status: 'PENDING',
        })),
      });

      // Create proposed PlanTaskLinks for each step's tasks
      const steps = await this.prisma.planStep.findMany({ where: { planId } });

      const stepMap = Object.fromEntries(steps.map((s) => [s.title, s.id]));

      const taskLinks = generated.steps.flatMap((step) =>
        (step.tasks ?? []).map((task) => ({
          id: createId(),
          planId,
          stepId: stepMap[step.title] ?? null,
          taskId: null,
          isProposed: true,
          proposedData: {
            title: task.title,
            description: task.description,
            priority: task.priority,
            estimatedHours: task.estimatedHours,
            dueDate: task.dueDate,
            dependsOn: task.dependsOn,
          } as Prisma.InputJsonValue,
        })),
      );

      if (taskLinks.length > 0) {
        await this.prisma.planTaskLink.createMany({
          data: taskLinks,
        });
      }
    }

    return { plan: updatedPlan, preview: generated };
  }

  async previewExecution(organizationId: string, planId: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id: planId, organizationId },
      include: { taskLinks: { where: { isProposed: true } } },
    });

    if (!plan) throw new Error('Plan not found');

    const preview = plan.previewData as GeneratedPlanJson | null;
    const taskLinks = plan.taskLinks as Array<{ proposedData: unknown }>;

    return {
      summary: {
        tasksToCreate: taskLinks.length,
        stepsToCreate: (preview?.steps ?? []).length,
        kpisToTrack: (preview?.kpis ?? []).length,
        warnings: preview?.warnings ?? [],
        risks: preview?.risks ?? [],
      },
      proposedTasks: taskLinks.map((l) => l.proposedData),
      proposedKpis: preview?.kpis ?? [],
    };
  }

  private async buildContext(organizationId: string, userId: string, dto: GeneratePlanDto): Promise<string> {
    if (!dto.includeBusinessContext) return '';

    const ctx = await this.permissionChecker.resolveExecutionContext(userId, organizationId);
    const perms = new Set(ctx.resolvedPermissions);
    const sections: string[] = [];

    if (dto.goalId) {
      try {
        const goal = await this.prisma.goal.findFirst({
          where: { id: dto.goalId, organizationId },
          include: { kpis: true },
        });
        if (goal) {
          sections.push(`LINKED GOAL: ${goal.title} (progress: ${goal.progress}%)`);
          if (goal.kpis.length > 0) {
            sections.push(
              `KPIs: ${goal.kpis.map((k) => `${k.name}: target=${k.target} current=${k.current} ${k.unit ?? ''}`).join(', ')}`,
            );
          }
        }
      } catch {
        // goal lookup failure is non-fatal
      }
    }

    if (perms.has(PERMISSIONS.TASKS.VIEW)) {
      try {
        const overdue = await this.prisma.task.count({
          where: {
            organizationId,
            assigneeId: userId,
            status: { notIn: ['DONE', 'CANCELLED'] },
            dueDate: { lt: new Date() },
          },
        });
        const upcoming = await this.prisma.task.count({
          where: {
            organizationId,
            assigneeId: userId,
            status: { notIn: ['DONE', 'CANCELLED'] },
            dueDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) },
          },
        });
        sections.push(`TASKS: ${overdue} overdue, ${upcoming} due within 7 days`);
      } catch {
        // non-fatal
      }
    }

    if (perms.has(PERMISSIONS.GOALS.VIEW)) {
      try {
        const goals = await this.prisma.goal.findMany({
          where: { organizationId, status: 'ACTIVE' },
          select: { title: true, progress: true, endDate: true },
          take: 5,
        });
        if (goals.length > 0) {
          sections.push(`ACTIVE GOALS: ${goals.map((g) => `"${g.title}" ${g.progress}%`).join('; ')}`);
        }
      } catch {
        // non-fatal
      }
    }

    return sections.join('\n');
  }
}
