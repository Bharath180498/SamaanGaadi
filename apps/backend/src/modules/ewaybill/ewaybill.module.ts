import { Module } from '@nestjs/common';
import { EwayBillController } from './ewaybill.controller';
import { EwayBillService } from './ewaybill.service';

@Module({
  providers: [EwayBillService],
  controllers: [EwayBillController],
  exports: [EwayBillService]
})
export class EwayBillModule {}
