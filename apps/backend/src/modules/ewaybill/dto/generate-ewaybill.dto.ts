import { IsNumber, IsString, Max, Min } from 'class-validator';

export class GenerateEwayBillDto {
  @IsString()
  gstin!: string;

  @IsNumber()
  @Min(1)
  @Max(1000000000)
  invoiceValue!: number;

  @IsString()
  hsnCode!: string;

  @IsString()
  vehicleNumber!: string;
}
