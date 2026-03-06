import { Module } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { DispatchController } from './dispatch.controller';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [DriversModule],
  providers: [DispatchService],
  controllers: [DispatchController],
  exports: [DispatchService]
})
export class DispatchModule {}
