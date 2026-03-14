import { Body, Controller, Headers, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { DriverConfirmPaymentDto } from './dto/driver-confirm-payment.dto';

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

  @Post('driver-confirm')
  driverConfirm(@Body() payload: DriverConfirmPaymentDto) {
    return this.paymentsService.driverConfirmDirectUpiPayment(payload);
  }

  @Post('webhooks/razorpay')
  webhook(
    @Body() payload: {
      event: string;
      providerRef?: string;
      payload?: {
        payment?: {
          entity?: {
            order_id?: string;
          };
        };
      };
      success?: boolean;
    },
    @Headers('x-razorpay-signature') signature?: string
  ) {
    return this.paymentsService.handleRazorpayWebhook(payload, signature);
  }

  @Post('webhooks/cashfree')
  cashfreeWebhook(
    @Body() payload: {
      type?: string;
      order_id?: string;
      orderId?: string;
      order_status?: string;
      payment_status?: string;
      txStatus?: string;
      data?: {
        order?: {
          order_id?: string;
          orderId?: string;
          order_status?: string;
        };
        payment?: {
          order_id?: string;
          payment_status?: string;
          cf_payment_id?: string | number;
          payment_id?: string;
        };
      };
    },
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-cf-signature') cfSignature?: string,
    @Headers('x-webhook-timestamp') timestamp?: string
  ) {
    return this.paymentsService.handleCashfreeWebhook(
      payload,
      signature ?? cfSignature,
      timestamp
    );
  }
}
