import { Body, Controller, Post } from '@nestjs/common';
import { EwayBillService } from './ewaybill.service';
import { GenerateEwayBillDto } from './dto/generate-ewaybill.dto';

@Controller('ewaybill')
export class EwayBillController {
  constructor(private readonly ewayBillService: EwayBillService) {}

  @Post('generate')
  generate(@Body() payload: GenerateEwayBillDto) {
    return this.ewayBillService.generate(payload);
  }
}
