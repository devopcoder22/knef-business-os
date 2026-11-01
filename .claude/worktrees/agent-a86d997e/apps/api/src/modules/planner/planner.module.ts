import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { AIActionsModule } from '../ai-actions/ai-actions.module';
import { TasksModule } from '../tasks/tasks.module';
import { GoalsModule } from '../goals/goals.module';
import { CalendarModule } from '../calendar/calendar.module';
import { CommunicationsModule } from '../communications/communications.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';

import { PlannerService } from './planner.service';
import { PlanGeneratorService } from './plan-generator.service';
import { PlanExecutorService } from './plan-executor.service';
import { PlanProgressService } from './plan-progress.service';
import { PersonalPlannerService } from './personal-planner.service';
import { PlansController, PersonalPlannerController } from './planner.controller';

@Module({
  imports: [
    AIModule,
    AIActionsModule,
    TasksModule,
    GoalsModule,
    CalendarModule,
    CommunicationsModule,
    AuditModule,
    PermissionsModule,
  ],
  providers: [
    PlannerService,
    PlanGeneratorService,
    PlanExecutorService,
    PlanProgressService,
    PersonalPlannerService,
  ],
  controllers: [PlansController, PersonalPlannerController],
  exports: [PlannerService, PersonalPlannerService],
})
export class PlannerModule {}
