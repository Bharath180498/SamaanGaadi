import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async notifyCustomer(customerId: string, event: string, payload: Record<string, unknown>) {
    this.logger.log(`Notify customer ${customerId}: ${event} ${JSON.stringify(payload)}`);
  }

  async notifyDriver(driverId: string, event: string, payload: Record<string, unknown>) {
    this.logger.log(`Notify driver ${driverId}: ${event} ${JSON.stringify(payload)}`);
  }
}
