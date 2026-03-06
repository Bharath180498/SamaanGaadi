import { Injectable } from '@nestjs/common';
import { InsurancePlan } from '@prisma/client';
import { QuoteInsuranceDto } from './dto/quote-insurance.dto';

@Injectable()
export class InsuranceService {
  quote(payload: QuoteInsuranceDto) {
    const goodsValue = payload.goodsValue;

    const options = [
      {
        plan: InsurancePlan.BASIC,
        premium: Number((goodsValue * 0.008).toFixed(2)),
        coverage: goodsValue,
        deductible: Number((goodsValue * 0.05).toFixed(2))
      },
      {
        plan: InsurancePlan.PREMIUM,
        premium: Number((goodsValue * 0.012).toFixed(2)),
        coverage: Number((goodsValue * 1.1).toFixed(2)),
        deductible: Number((goodsValue * 0.03).toFixed(2))
      },
      {
        plan: InsurancePlan.HIGH_VALUE,
        premium: Number((goodsValue * 0.018).toFixed(2)),
        coverage: Number((goodsValue * 1.3).toFixed(2)),
        deductible: Number((goodsValue * 0.02).toFixed(2))
      }
    ];

    return {
      goodsType: payload.goodsType,
      goodsValue,
      currency: 'INR',
      options
    };
  }
}
