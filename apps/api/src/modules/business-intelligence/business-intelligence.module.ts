import { Module } from '@nestjs/common';
import { BusinessIntelligenceController } from './business-intelligence.controller';
import { BusinessIntelligenceService } from './business-intelligence.service';
import { BusinessMetricsService } from './business-metrics.service';
import { ForecastingService } from './forecasting.service';
import { SimulationService } from './simulation.service';
import { RecommendationService } from './recommendation.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  controllers: [BusinessIntelligenceController],
  providers: [
    BusinessIntelligenceService,
    BusinessMetricsService,
    ForecastingService,
    SimulationService,
    RecommendationService,
  ],
  exports: [BusinessIntelligenceService],
})
export class BusinessIntelligenceModule {}
