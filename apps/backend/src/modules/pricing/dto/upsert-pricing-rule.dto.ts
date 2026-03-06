import { IsNumber, Max, Min } from 'class-validator';

export class UpsertPricingRuleDto {
  @IsNumber()
  @Min(0)
  @Max(5)
  minDriverRating!: number;

  @IsNumber()
  @Min(0)
  @Max(5)
  maxDriverRating!: number;

  @IsNumber()
  @Min(0.1)
  @Max(2)
  multiplier!: number;
}
