import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DispatchModule } from '../dispatch/dispatch.module';
import { PricingModule } from '../pricing/pricing.module';
import { EwayBillModule } from '../ewaybill/ewaybill.module';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [DispatchModule, PricingModule, EwayBillModule, DriversModule],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService]
})
export class OrdersModule {}
