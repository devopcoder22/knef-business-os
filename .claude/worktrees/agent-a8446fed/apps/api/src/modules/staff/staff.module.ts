import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { EmployeesController, DepartmentsController } from './staff.controller';

@Module({
  providers: [StaffService],
  controllers: [EmployeesController, DepartmentsController],
  exports: [StaffService],
})
export class StaffModule {}
