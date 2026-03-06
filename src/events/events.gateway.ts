import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../common/types/jwt-payload';

const socketCorsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: socketCorsOrigins.length ? socketCorsOrigins : true,
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('EventsGateway');
  constructor(private readonly jwtService: JwtService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized');
  }

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
        if (payload?.sub) {
          client.data.user = payload;
          void client.join(`user:${payload.sub}`);
          if (payload.role === 'admin') {
            void client.join('admin');
          }
        }
      } catch {
        // anonymous socket is allowed, but sensitive channels require admin room
      }
    }
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.trim()) {
      return header.replace(/^Bearer\s+/i, '').trim();
    }
    return null;
  }

  // Hàm helper để bắn sự kiện tới tất cả client
  emitProductUpdated(product: any) {
    this.server.emit('product_updated', product);
  }

  // Chỉ tài khoản admin đã xác thực JWT mới nhận được db_change
  emitDbChange(payload: {
    collection?: string;
    operationType?: string;
    documentId?: unknown;
    changedAt?: string;
  }) {
    this.server.to('admin').emit('db_change', payload);
  }

  emitToUser(userId: string, event: string, payload: Record<string, any> = {}) {
    if (!userId) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitCartUpdated(userId: string, payload: Record<string, any> = {}) {
    this.emitToUser(userId, 'cart_updated', {
      ...payload,
      changedAt: payload.changedAt || new Date().toISOString(),
    });
  }
}
