import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersModule } from '../orders/orders.module';
import { CartsModule } from '../carts/carts.module';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    OrdersModule,
    CartsModule,
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
