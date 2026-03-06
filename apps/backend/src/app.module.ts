import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TripsModule } from './modules/trips/trips.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { InsuranceModule } from './modules/insurance/insurance.module';
import { EwayBillModule } from './modules/ewaybill/ewaybill.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv
    }),
    PrismaModule,
    RedisModule,
    RealtimeModule,
    NotificationsModule,
    PricingModule,
    DispatchModule,
    InsuranceModule,
    EwayBillModule,
    PaymentsModule,
    UsersModule,
    AuthModule,
    DriversModule,
    OrdersModule,
    TripsModule,
    AdminModule,
    HealthModule
  ]
})
export class AppModule {}
