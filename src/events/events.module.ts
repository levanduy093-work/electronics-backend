import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';
import { DbChangeListener } from './db-change-listener.service';

@Global() // Để có thể dùng ở mọi nơi (ProductService, OrderService...)
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET must be provided');
        }
        return {
          secret,
        };
      },
    }),
  ],
  providers: [EventsGateway, DbChangeListener],
  exports: [EventsGateway],
})
export class EventsModule {}
