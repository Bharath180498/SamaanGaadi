import { Injectable } from '@nestjs/common';
import { InsurancePlan, VehicleType } from '@prisma/client';
import { RATING_PRICE_MULTIPLIERS, VEHICLE_BASE_FARE } from '@porter/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async getRatingMultiplier(driverRating: number) {
    const customRule = await this.prisma.pricingRule.findFirst({
      where: {
        minDriverRating: { lte: driverRating },
        maxDriverRating: { gt: driverRating }
      },
      orderBy: { minDriverRating: 'desc' }
    });

    if (customRule) {
      return customRule.multiplier;
    }

    const fallbackRule = RATING_PRICE_MULTIPLIERS.find((rule) => driverRating >= rule.min);
    return fallbackRule?.multiplier ?? 1;
  }

  calculateInsurancePremium(plan: InsurancePlan, goodsValue: number) {
    if (plan === InsurancePlan.NONE) {
      return 0;
    }

    const rate =
      plan === InsurancePlan.BASIC ? 0.008 : plan === InsurancePlan.PREMIUM ? 0.012 : 0.018;

    return Number((goodsValue * rate).toFixed(2));
  }

  async estimatePrice(input: {
    vehicleType: VehicleType;
    distanceKm: number;
    driverRating?: number;
    insurancePlan?: InsurancePlan;
    goodsValue?: number;
    waitingCharge?: number;
  }) {
    const baseFare = VEHICLE_BASE_FARE[input.vehicleType];
    const distanceFare = Math.max(0, input.distanceKm) * 14;
    const waitingCharge = input.waitingCharge ?? 0;
    const insurancePlan = input.insurancePlan ?? InsurancePlan.NONE;
    const insuranceCharge = this.calculateInsurancePremium(insurancePlan, input.goodsValue ?? 0);

    const multiplier = input.driverRating ? await this.getRatingMultiplier(input.driverRating) : 1;

    const subtotal = (baseFare + distanceFare + waitingCharge + insuranceCharge) * multiplier;

    return {
      baseFare,
      distanceFare: Number(distanceFare.toFixed(2)),
      waitingCharge,
      insuranceCharge,
      discount: Number(((baseFare + distanceFare) * (1 - multiplier)).toFixed(2)),
      total: Number(subtotal.toFixed(2)),
      multiplier
    };
  }

  listRules() {
    return this.prisma.pricingRule.findMany({ orderBy: { minDriverRating: 'desc' } });
  }

  upsertRule(input: { minDriverRating: number; maxDriverRating: number; multiplier: number }) {
    return this.prisma.pricingRule.create({
      data: input
    });
  }
}
