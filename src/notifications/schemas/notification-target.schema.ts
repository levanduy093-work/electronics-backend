import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Notification } from './notification.schema';

@Schema({ collection: 'notification_targets', timestamps: true })
export class NotificationTarget {
  @Prop({ type: Types.ObjectId, ref: Notification.name, required: true })
  notification_id: Types.ObjectId;

  @Prop({ required: true, enum: ['all_users', 'user', 'segment'], default: 'all_users' })
  scope: 'all_users' | 'user' | 'segment';

  @Prop({ type: Types.ObjectId, ref: 'users' })
  user_id?: Types.ObjectId;

  @Prop()
  segment_id?: string;
}

export type NotificationTargetDocument = HydratedDocument<NotificationTarget>;
export const NotificationTargetSchema = SchemaFactory.createForClass(NotificationTarget);
