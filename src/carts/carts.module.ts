import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CartsController } from './carts.controller';
import { CartsService } from './carts.service';
import { Cart, CartSchema } from './schemas/cart.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }])],
  controllers: [CartsController],
  providers: [CartsService],
  exports: [CartsService],
})
export class CartsModule {}
