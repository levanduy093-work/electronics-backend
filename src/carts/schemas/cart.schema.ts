import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
class CartItem {
  @Prop({ type: Types.ObjectId, ref: 'products', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  category: string;

  @Prop()
  image?: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  quantity: number;
}

@Schema({ collection: 'carts', timestamps: true })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'users', required: true })
  userId: Types.ObjectId;

  @Prop({ type: [CartItem], default: [] })
  items: CartItem[];

  @Prop({ type: Types.ObjectId, ref: 'vouchers' })
  voucher?: Types.ObjectId;

  @Prop({ default: 0 })
  totalItem: number;

  @Prop({ default: 0 })
  subTotal: number;

  @Prop({ default: 0 })
  shippingFee: number;

  @Prop({ default: 0 })
  totalPrice: number;
}

export type CartDocument = HydratedDocument<Cart>;
export const CartItemSchema = SchemaFactory.createForClass(CartItem);
export const CartSchema = SchemaFactory.createForClass(Cart);
