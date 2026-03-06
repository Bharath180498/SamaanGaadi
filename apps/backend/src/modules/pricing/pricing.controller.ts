import { Body, Controller, Get, Post } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { UpsertPricingRuleDto } from './dto/upsert-pricing-rule.dto';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('rules')
  listRules() {
    return this.pricingService.listRules();
  }

  @Post('rules')
  upsertRule(@Body() payload: UpsertPricingRuleDto) {
    return this.pricingService.upsertRule(payload);
  }
}
