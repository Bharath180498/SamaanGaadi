import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: '*' }
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`Socket connected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:order')
  subscribeOrder(@MessageBody() payload: { orderId: string }, @ConnectedSocket() client: Socket) {
    client.join(`order:${payload.orderId}`);
  }

  @SubscribeMessage('subscribe:driver')
  subscribeDriver(@MessageBody() payload: { driverId: string }, @ConnectedSocket() client: Socket) {
    client.join(`driver:${payload.driverId}`);
  }
}
