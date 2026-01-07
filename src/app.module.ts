import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { CartsModule } from './carts/carts.module';
import { ChatModule } from './chat/chat.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HealthModule } from './health/health.module';
import { InventoryMovementsModule } from './inventory-movements/inventory-movements.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';
import { VouchersModule } from './vouchers/vouchers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(
      process.env.MONGO_URI ||
        'mongodb://admin:123456@localhost:27017/electronics_shop?authSource=admin',
    ),
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    CartsModule,
    VouchersModule,
    ReviewsModule,
    TransactionsModule,
    ShipmentsModule,
    InventoryMovementsModule,
    ChatModule,
    AiModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
