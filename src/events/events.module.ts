import { Module, Global } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

@Global() // Để có thể dùng ở mọi nơi (ProductService, OrderService...)
@Module({
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
