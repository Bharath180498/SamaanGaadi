import { Body, Controller, Post } from '@nestjs/common';
import { InsuranceService } from './insurance.service';
import { QuoteInsuranceDto } from './dto/quote-insurance.dto';

@Controller('insurance')
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Post('quote')
  quote(@Body() payload: QuoteInsuranceDto) {
    return this.insuranceService.quote(payload);
  }
}
