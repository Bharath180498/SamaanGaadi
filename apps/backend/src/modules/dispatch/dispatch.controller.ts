import { Controller, Get, Param, Post } from '@nestjs/common';
import { DispatchService } from './dispatch.service';

@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Post('orders/:orderId/assign')
  assignOrder(@Param('orderId') orderId: string) {
    return this.dispatchService.assignOrder(orderId);
  }

  @Get('orders/:orderId/candidates')
  previewCandidates(@Param('orderId') orderId: string) {
    return this.dispatchService.previewCandidates(orderId);
  }

  @Post('scheduled/run')
  runScheduledDispatch() {
    return this.dispatchService.runScheduledDispatch();
  }
}
