import { IsNumber, IsString, Min } from 'class-validator';

export class GenerateOrderEwayBillDto {
  @IsString()
  gstin!: string;

  @IsNumber()
  @Min(1)
  invoiceValue!: number;

  @IsString()
  hsnCode!: string;

  @IsString()
  vehicleNumber!: string;
}
