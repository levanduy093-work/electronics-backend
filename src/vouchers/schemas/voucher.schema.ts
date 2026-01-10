import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'vouchers', timestamps: true })
export class Voucher {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop()
  description?: string;

  @Prop({ default: 'fixed', enum: ['fixed', 'shipping', 'percentage'] })
  type: 'fixed' | 'shipping' | 'percentage';

  @Prop()
  discountPrice: number;

  @Prop()
  discountRate?: number;

  @Prop()
  maxDiscountPrice?: number;

  @Prop({ required: true })
  minTotal: number;

  @Prop({ required: true })
  expire: Date;
}

export type VoucherDocument = HydratedDocument<Voucher>;
export const VoucherSchema = SchemaFactory.createForClass(Voucher);
