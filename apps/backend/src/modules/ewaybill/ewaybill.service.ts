import { BadRequestException, Injectable } from '@nestjs/common';
import { GenerateEwayBillDto } from './dto/generate-ewaybill.dto';

@Injectable()
export class EwayBillService {
  generate(payload: GenerateEwayBillDto) {
    if (!/^\d{15}$/.test(payload.gstin)) {
      throw new BadRequestException('Invalid GSTIN format');
    }

    const ewayBillNumber = `EWB${Date.now()}${Math.floor(Math.random() * 10_000)}`;

    return {
      ewayBillNumber,
      validTill: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      status: 'GENERATED',
      payload
    };
  }
}
