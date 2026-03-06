import { IsNumber, IsString, Max, Min } from 'class-validator';

export class QuoteInsuranceDto {
  @IsString()
  goodsType!: string;

  @IsNumber()
  @Min(100)
  @Max(100000000)
  goodsValue!: number;
}
