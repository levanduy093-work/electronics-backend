import { Module, Global } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { DbChangeListener } from './db-change-listener.service';

@Global() // Để có thể dùng ở mọi nơi (ProductService, OrderService...)
@Module({
  providers: [EventsGateway, DbChangeListener],
  exports: [EventsGateway],
})
export class EventsModule {}
