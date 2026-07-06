import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AuditLogsModule } from './audit-logs.module';
import { EventsModule } from './events.module';
import { NenposClientsModule } from './nenpos-clients.module';
import { AuthModule } from './auth.module';
import { BackupsModule } from './backups.module';
import { ClientsModule } from './clients.module';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { CompanyProfileModule } from './company-profile.module';
import { DevProjectsModule } from './dev-projects.module';
import { EarningsModule } from './earnings.module';
import { InventoryModule } from './inventory.module';
import { JobOrdersModule } from './job-orders.module';
import { JobsModule } from './jobs.module';
import { KpisModule } from './kpis.module';
import { LicensesModule } from './licenses.module';
import { MachinesModule } from './machines.module';
import { NotificationsModule } from './notifications.module';
import { PrismaModule } from './prisma.module';
import { SoftwareProductsModule } from './software-products.module';
import { UploadsModule } from './uploads.module';
import { UsersModule } from './users.module';
import { WithdrawalsModule } from './withdrawals.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'admin-web', 'dist'),
      exclude: ['/api/{*path}'],
    }),
    PrismaModule,
    AuthModule,
    EventsModule,
    NotificationsModule,
    UsersModule,
    ClientsModule,
    SoftwareProductsModule,
    LicensesModule,
    JobsModule,
    JobOrdersModule,
    InventoryModule,
    EarningsModule,
    WithdrawalsModule,
    AuditLogsModule,
    KpisModule,
    CompanyProfileModule,
    BackupsModule,
    UploadsModule,
    MachinesModule,
    DevProjectsModule,
    NenposClientsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
