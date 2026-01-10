import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Notification } from './notification.schema';

@Schema({ collection: 'user_notification_status', timestamps: true })
export class UserNotificationStatus {
  @Prop({ type: Types.ObjectId, ref: Notification.name, required: true })
  notification_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'users', required: true })
  user_id: Types.ObjectId;

  @Prop({ default: false })
  is_read: boolean;

  @Prop()
  delivered_at?: Date;

  @Prop()
  read_at?: Date;
}

export type UserNotificationStatusDocument = HydratedDocument<UserNotificationStatus>;
export const UserNotificationStatusSchema = SchemaFactory.createForClass(UserNotificationStatus);
