import { Module } from '@nestjs/common';
import { TestimonialService } from './testimonial.service';
import { TestimonialController } from './testimonial.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [TestimonialService],
  controllers: [TestimonialController],
  exports: [TestimonialService],
})
export class TestimonialsModule {}
