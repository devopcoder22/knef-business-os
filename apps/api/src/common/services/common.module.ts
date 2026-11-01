import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { LocationScopeService } from './location-scope.service';
import { QueueService } from './queue.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, LocationScopeService, QueueService],
  exports: [PrismaService, RedisService, LocationScopeService, QueueService],
})
export class CommonModule {}
