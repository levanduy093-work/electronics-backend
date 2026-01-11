import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
class StatusEntry {
  @Prop({ required: true })
  status: string;

  @Prop()
  at?: Date;
}

@Schema({ collection: 'shipments', timestamps: true })
export class Shipment {
  @Prop({ type: Types.ObjectId, ref: 'orders', required: true })
  orderId: Types.ObjectId;

  @Prop({ required: true })
  carrier: string;

  @Prop({ required: true })
  trackingNumber: string;

  @Prop({ required: true })
  status: string;

  @Prop({ type: [StatusEntry], default: [] })
  statusHistory: StatusEntry[];

  @Prop()
  paymentMethod?: string;

  @Prop()
  paymentStatus?: string;

  @Prop()
  expectedDelivery?: Date;
}

export type ShipmentDocument = HydratedDocument<Shipment>;
export const StatusEntrySchema = SchemaFactory.createForClass(StatusEntry);
export const ShipmentSchema = SchemaFactory.createForClass(Shipment);
