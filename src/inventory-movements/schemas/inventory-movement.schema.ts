import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'inventory_movements', timestamps: true })
export class InventoryMovement {
  @Prop({ type: Types.ObjectId, ref: 'products', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  type: string; // inbound | outbound

  @Prop({ required: true })
  quantity: number;

  @Prop()
  note?: string;
}

export type InventoryMovementDocument = HydratedDocument<InventoryMovement>;
export const InventoryMovementSchema = SchemaFactory.createForClass(InventoryMovement);
