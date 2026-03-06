import { Body, Controller, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-intent')
  createIntent(@Body() payload: CreatePaymentDto) {
    return this.paymentsService.createIntent(payload);
  }

  @Post('confirm')
  confirm(@Body() payload: ConfirmPaymentDto) {
    return this.paymentsService.confirm(payload);
  }
}
