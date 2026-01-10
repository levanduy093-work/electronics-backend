import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { NotificationTarget, NotificationTargetSchema } from './schemas/notification-target.schema';
import {
  UserNotificationStatus,
  UserNotificationStatusSchema,
} from './schemas/user-notification-status.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: NotificationTarget.name, schema: NotificationTargetSchema },
      { name: UserNotificationStatus.name, schema: UserNotificationStatusSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
