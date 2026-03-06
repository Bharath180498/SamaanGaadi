import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [DispatchModule, DriversModule],
  providers: [TripsService],
  controllers: [TripsController],
  exports: [TripsService]
})
export class TripsModule {}
