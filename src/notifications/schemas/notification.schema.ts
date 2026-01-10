import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ default: 'system' })
  type: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;

  @Prop({ default: 'normal', enum: ['low', 'normal', 'high'] })
  priority: 'low' | 'normal' | 'high';

  // Giữ snake_case để khớp dữ liệu đã seed trong Mongo
  @Prop()
  send_at?: Date;

  @Prop()
  expires_at?: Date;

  @Prop({ type: Types.ObjectId, ref: 'users' })
  created_by?: Types.ObjectId;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
