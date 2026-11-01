import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { AttendanceService } from './attendance.service';
import { ResponsibilityService } from './responsibility.service';
import { EmployeesController, DepartmentsController } from './staff.controller';
import { AttendanceController } from './attendance.controller';
import { ResponsibilityController } from './responsibility.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [StaffService, AttendanceService, ResponsibilityService],
  controllers: [
    EmployeesController,
    DepartmentsController,
    AttendanceController,
    ResponsibilityController,
  ],
  exports: [StaffService, AttendanceService, ResponsibilityService],
})
export class StaffModule {}
