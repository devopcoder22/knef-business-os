import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import appConfig, { validateConfig } from './config/app.config';
import { CommonModule } from './common/services/common.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { LocationsModule } from './modules/locations/locations.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { AuditModule } from './modules/audit/audit.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    // Config — load and validate env
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: (config) => validateConfig(config),
      cache: true,
    }),

    // Event emitter — internal domain events
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 20,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 100,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 500,
      },
    ]),

    // Shared infrastructure
    CommonModule,

    // Feature modules
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    LocationsModule,
    DepartmentsModule,
    RolesModule,
    PermissionsModule,
    FeatureFlagsModule,
    AuditModule,
    SettingsModule,
  ],
})
export class AppModule {}
