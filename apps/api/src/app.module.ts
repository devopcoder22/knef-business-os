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
import { CategoriesModule } from './modules/categories/categories.module';
import { BrandsModule } from './modules/brands/brands.module';
import { ProductsModule } from './modules/products/products.module';
import { SerializedUnitsModule } from './modules/serialized-units/serialized-units.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { StockTransfersModule } from './modules/stock-transfers/stock-transfers.module';
import { StockAdjustmentsModule } from './modules/stock-adjustments/stock-adjustments.module';
import { StockCountsModule } from './modules/stock-counts/stock-counts.module';
import { SearchModule } from './modules/search/search.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SalesModule } from './modules/sales/sales.module';
import { POSModule } from './modules/pos/pos.module';
import { FinanceModule } from './modules/finance/finance.module';
import { StaffModule } from './modules/staff/staff.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { GoalsModule } from './modules/goals/goals.module';
import { ReportsModule } from './modules/reports/reports.module';
import { EcommerceModule } from './modules/ecommerce/ecommerce.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { CommunicationsModule } from './modules/communications/communications.module';

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
    CategoriesModule,
    BrandsModule,
    ProductsModule,
    SerializedUnitsModule,
    InventoryModule,
    StockTransfersModule,
    StockAdjustmentsModule,
    StockCountsModule,
    SearchModule,
    SuppliersModule,
    PurchasingModule,
    CustomersModule,
    SalesModule,
    POSModule,
    FinanceModule,
    StaffModule,
    TasksModule,
    GoalsModule,
    ReportsModule,
    EcommerceModule,
    IntegrationsModule,
    CommunicationsModule,
  ],
})
export class AppModule {}
