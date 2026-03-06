import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitDriverLocation(payload: {
    driverId: string;
    orderId?: string;
    lat: number;
    lng: number;
    timestamp: string;
  }) {
    this.gateway.server.to(`driver:${payload.driverId}`).emit('driver:location', payload);

    if (payload.orderId) {
      this.gateway.server.to(`order:${payload.orderId}`).emit('driver:location', payload);
    }
  }

  emitTripUpdate(orderId: string, event: string, data: Record<string, unknown>) {
    this.gateway.server.to(`order:${orderId}`).emit(event, data);
  }

  emitDriverUpdate(driverId: string, event: string, data: Record<string, unknown>) {
    this.gateway.server.to(`driver:${driverId}`).emit(event, data);
  }
}
