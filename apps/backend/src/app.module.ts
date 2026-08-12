import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenantMiddleware } from './common/tenancy/tenant.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { BillsModule } from './modules/bills/bills.module';
import { GstModule } from './modules/gst/gst.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { GstnModule } from './modules/gstn/gstn.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AuditModule } from './modules/audit/audit.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { ProductsModule } from './modules/products/products.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { RecurringModule } from './modules/recurring/recurring.module';
import { UsersModule } from './modules/users/users.module';
import { PlatformModule } from './modules/platform/platform.module';
import { StorageModule } from './common/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    AuthModule,
    TenantsModule,
    BillsModule,
    GstModule,
    ReturnsModule,
    VendorsModule,
    GstnModule,
    SubscriptionsModule,
    AuditModule,
    DashboardModule,
    ReportsModule,
    OrganizationModule,
    ProductsModule,
    ExpensesModule,
    RecurringModule,
    UsersModule,
    PlatformModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply tenant context to all routes except auth/login.
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
