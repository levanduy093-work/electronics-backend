import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
class OrderStatus {
  @Prop()
  ordered?: Date;

  @Prop()
  confirmed?: Date;

  @Prop()
  packaged?: Date;

  @Prop()
  shipped?: Date;
}

@Schema({ _id: false })
class ShippingAddress {
  @Prop()
  name?: string;

  @Prop()
  phone?: string;

  @Prop()
  city?: string;

  @Prop()
  district?: string;

  @Prop()
  ward?: string;

  @Prop()
  street?: string;
}

@Schema({ _id: false })
class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'products', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  subTotal: number;

  @Prop({ default: 0 })
  shippingFee: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ required: true })
  totalPrice: number;

  @Prop()
  selectedOption?: string;

  @Prop()
  selectedClassification?: string;
}

@Schema({ collection: 'orders', timestamps: true })
export class Order {
  @Prop({ required: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'users', required: true })
  userId: Types.ObjectId;

  @Prop({ type: OrderStatus, default: {} })
  status: OrderStatus;

  @Prop({ default: false })
  isCancelled: boolean;

  @Prop({ type: ShippingAddress })
  shippingAddress?: ShippingAddress;

  @Prop({ type: [OrderItem], default: [] })
  items: OrderItem[];

  @Prop({ type: Types.ObjectId, ref: 'vouchers' })
  voucher?: Types.ObjectId;

  @Prop({ default: 0 })
  subTotal: number;

  @Prop({ default: 0 })
  shippingFee: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ default: 0 })
  totalPrice: number;

  @Prop()
  payment?: string;

  @Prop()
  paymentStatus?: string;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderStatusSchema = SchemaFactory.createForClass(OrderStatus);
export const ShippingAddressSchema = SchemaFactory.createForClass(ShippingAddress);
export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
export const OrderSchema = SchemaFactory.createForClass(Order);
