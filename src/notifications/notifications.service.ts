import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserNotificationStatus, UserNotificationStatusDocument } from './schemas/user-notification-status.schema';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { NotificationTarget, NotificationTargetDocument } from './schemas/notification-target.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { FirebaseService } from '../common/firebase/firebase.service';

export type NotificationView = {
  id: string;
  _id?: string;
  title: string;
  body: string;
  type: string;
  metadata?: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high';
  sendAt?: Date;
  expiresAt?: Date;
  isRead: boolean;
  readAt?: Date;
  deliveredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(NotificationTarget.name)
    private readonly notificationTargetModel: Model<NotificationTargetDocument>,
    @InjectModel(UserNotificationStatus.name)
    private readonly userNotificationStatusModel: Model<UserNotificationStatusDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly firebaseService: FirebaseService,
  ) {}
// ... (rest of the file until applyTargetsAndStatuses)


  async findForUser(userId: string): Promise<NotificationView[]> {
    const userObjectId = new Types.ObjectId(userId);
    const now = new Date();
    return this.userNotificationStatusModel
      .aggregate<NotificationView>([
        { $match: { user_id: userObjectId } },
        {
          $lookup: {
            from: 'notifications',
            localField: 'notification_id',
            foreignField: '_id',
            as: 'notification',
          },
        },
        { $unwind: '$notification' },
        {
          $match: {
            $or: [
              { 'notification.expires_at': { $exists: false } },
              { 'notification.expires_at': { $gt: now } },
            ],
          },
        },
        {
          $addFields: {
            effectiveSendAt: { $ifNull: ['$notification.send_at', '$notification.createdAt'] },
          },
        },
        {
          $sort: {
            effectiveSendAt: -1,
            'notification.createdAt': -1,
          },
        },
        {
          $project: {
            _id: '$notification._id',
            id: '$notification._id',
            title: '$notification.title',
            body: '$notification.body',
            type: { $ifNull: ['$notification.type', 'system'] },
            metadata: { $ifNull: ['$notification.metadata', {}] },
            priority: { $ifNull: ['$notification.priority', 'normal'] },
            sendAt: '$effectiveSendAt',
            expiresAt: '$notification.expires_at',
            isRead: { $ifNull: ['$is_read', false] },
            readAt: '$read_at',
            deliveredAt: '$delivered_at',
            createdAt: '$notification.createdAt',
            updatedAt: '$notification.updatedAt',
          },
        },
      ])
      .exec();
  }

  async markRead(userId: string, notificationId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const notificationObjectId = new Types.ObjectId(notificationId);
    const result = await this.userNotificationStatusModel.updateOne(
      { user_id: userObjectId, notification_id: notificationObjectId },
      { $set: { is_read: true, read_at: new Date() } },
    );

    if (!result.matchedCount) {
      throw new NotFoundException('Notification not found');
    }

    return this.findForUser(userId);
  }

  async markAllRead(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    await this.userNotificationStatusModel.updateMany(
      { user_id: userObjectId, is_read: { $ne: true } },
      { $set: { is_read: true, read_at: new Date() } },
    );
    return this.findForUser(userId);
  }

  // Admin APIs
  async adminFindAll() {
    return this.notificationModel
      .aggregate([
        {
          $lookup: {
            from: 'notification_targets',
            localField: '_id',
            foreignField: 'notification_id',
            as: 'targets',
          },
        },
        {
          $lookup: {
            from: 'user_notification_status',
            localField: '_id',
            foreignField: 'notification_id',
            as: 'statuses',
          },
        },
        {
          $addFields: {
            readCount: {
              $size: {
                $filter: {
                  input: '$statuses',
                  as: 's',
                  cond: { $eq: ['$$s.is_read', true] },
                },
              },
            },
            totalDeliveries: { $size: '$statuses' },
          },
        },
        {
          $project: {
            _id: 1,
            title: 1,
            body: 1,
            type: 1,
            priority: 1,
            metadata: 1,
            send_at: 1,
            expires_at: 1,
            created_by: 1,
            createdAt: 1,
            updatedAt: 1,
            targets: 1,
            readCount: 1,
            totalDeliveries: 1,
          },
        },
        { $sort: { send_at: -1, createdAt: -1 } },
      ])
      .exec();
  }

  async adminCreate(dto: CreateNotificationDto, adminUserId?: string) {
    const sendAt = dto.sendAt ? new Date(dto.sendAt) : undefined;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    const created = await this.notificationModel.create({
      title: dto.title,
      body: dto.body,
      type: dto.type || 'system',
      priority: dto.priority || 'normal',
      metadata: dto.metadata || {},
      send_at: sendAt,
      expires_at: expiresAt,
      created_by: adminUserId ? new Types.ObjectId(adminUserId) : undefined,
    });

    const target = dto.target || { scope: 'all_users' };
    await this.applyTargetsAndStatuses(created._id, target, sendAt, expiresAt);

    return this.adminFindOne(created._id.toString());
  }

  async adminFindOne(id: string) {
    const notification = await this.notificationModel.findById(id).lean();
    if (!notification) throw new NotFoundException('Notification not found');

    const targets = await this.notificationTargetModel.find({ notification_id: notification._id }).lean();
    const statuses = await this.userNotificationStatusModel.find({ notification_id: notification._id }).lean();
    const readCount = statuses.filter((s) => s.is_read).length;

    return {
      ...notification,
      targets,
      readCount,
      totalDeliveries: statuses.length,
    };
  }

  async adminUpdate(id: string, dto: UpdateNotificationDto) {
    const notification = await this.notificationModel.findById(id);
    if (!notification) throw new NotFoundException('Notification not found');

    if (dto.title !== undefined) notification.title = dto.title;
    if (dto.body !== undefined) notification.body = dto.body;
    if (dto.type !== undefined) notification.type = dto.type;
    if (dto.priority !== undefined) notification.priority = dto.priority;
    if (dto.metadata !== undefined) notification.metadata = dto.metadata;
    if (dto.sendAt !== undefined) notification.send_at = dto.sendAt ? new Date(dto.sendAt) : undefined;
    if (dto.expiresAt !== undefined) notification.expires_at = dto.expiresAt ? new Date(dto.expiresAt) : undefined;

    await notification.save();

    if (dto.target) {
      await this.notificationTargetModel.deleteMany({ notification_id: notification._id });
      await this.userNotificationStatusModel.deleteMany({ notification_id: notification._id });
      const sendAt = dto.sendAt ? new Date(dto.sendAt) : notification.send_at;
      const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : notification.expires_at;
      await this.applyTargetsAndStatuses(notification._id, dto.target, sendAt, expiresAt);
    }

    return this.adminFindOne(id);
  }

  async adminDelete(id: string) {
    const notificationId = new Types.ObjectId(id);
    await this.notificationTargetModel.deleteMany({ notification_id: notificationId });
    await this.userNotificationStatusModel.deleteMany({ notification_id: notificationId });
    const result = await this.notificationModel.deleteOne({ _id: notificationId });
    if (!result.deletedCount) throw new NotFoundException('Notification not found');
    return { message: 'Deleted' };
  }

  private async applyTargetsAndStatuses(
    notificationId: Types.ObjectId,
    target: { scope: 'all_users' | 'user'; emails?: string[]; userIds?: string[] },
    sendAt?: Date,
    expiresAt?: Date,
  ) {
    const notification = await this.notificationModel.findById(notificationId).lean();
    if (!notification) return;

    if (target.scope === 'all_users') {
      await this.notificationTargetModel.create({
        notification_id: notificationId,
        scope: 'all_users',
      });

      const users = await this.userModel.find({}, { _id: 1, fcmTokens: 1 }).lean();
      if (users.length) {
        const statuses = users.map((u) => ({
          notification_id: notificationId,
          user_id: u._id,
          is_read: false,
          delivered_at: sendAt || new Date(),
          expires_at: expiresAt,
        }));
        await this.userNotificationStatusModel.insertMany(statuses);

        // Send Push Notifications
        const tokens = users.flatMap(u => u.fcmTokens || []).filter(Boolean);
        if (tokens.length) {
           await this.firebaseService.sendToDevice(tokens, notification.title, notification.body, notification.metadata as any);
        }
      }
      return;
    }

    const ids: Types.ObjectId[] = [];
    if (target.userIds?.length) {
      target.userIds.forEach((id) => {
        if (Types.ObjectId.isValid(id)) ids.push(new Types.ObjectId(id));
      });
    }
    if (target.emails?.length) {
      const normalized = target.emails.map((e) => (e || '').toLowerCase().trim()).filter(Boolean);
      if (normalized.length) {
        const users = await this.userModel
          .find({ email: { $in: normalized } }, { _id: 1 })
          .lean();
        users.forEach((u) => ids.push(u._id));
      }
    }

    const uniqueIds = [...new Set(ids.map((x) => x.toString()))].map((id) => new Types.ObjectId(id));
    if (!uniqueIds.length) {
      throw new ForbiddenException('No target users found for this notification');
    }

    await this.notificationTargetModel.insertMany(
      uniqueIds.map((uid) => ({
        notification_id: notificationId,
        scope: 'user',
        user_id: uid,
      })),
    );

    await this.userNotificationStatusModel.insertMany(
      uniqueIds.map((uid) => ({
        notification_id: notificationId,
        user_id: uid,
        is_read: false,
        delivered_at: sendAt || new Date(),
        expires_at: expiresAt,
      })),
    );

    // Send Push Notifications to specific users
    const targetUsers = await this.userModel.find({ _id: { $in: uniqueIds } }, { fcmTokens: 1 }).lean();
    const tokens = targetUsers.flatMap(u => u.fcmTokens || []).filter(Boolean);
    if (tokens.length) {
       await this.firebaseService.sendToDevice(tokens, notification.title, notification.body, notification.metadata as any);
    }
  }
}
