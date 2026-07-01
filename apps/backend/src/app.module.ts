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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply tenant context to all routes except auth/login.
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
