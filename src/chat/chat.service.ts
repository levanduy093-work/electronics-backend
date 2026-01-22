import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtPayload } from '../common/types/jwt-payload';
import {
  ChatSession,
  ChatSessionDocument,
} from './schemas/chat-session.schema';
import {
  CreateChatSessionDto,
  ChatMessageDto,
} from './dto/create-chat-session.dto';
import { UpdateChatSessionDto } from './dto/update-chat-session.dto';
import { stripDocument } from '../common/utils/strip-doc.util';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatSession.name)
    private readonly chatModel: Model<ChatSessionDocument>,
  ) { }

  async create(data: CreateChatSessionDto, user: JwtPayload) {
    const created = await this.chatModel.create({
      ...data,
      userId: new Types.ObjectId(user.sub),
      messages: data.messages?.map(this.mapMessage),
    });
    return stripDocument(created.toObject());
  }

  async findAll(user: JwtPayload) {
    const filter =
      user.role === 'admin' ? {} : { userId: new Types.ObjectId(user.sub) };
    const docs = await this.chatModel.find(filter).lean();
    return docs.map(stripDocument);
  }

  async findOne(id: string, user: JwtPayload) {
    const doc = await this.chatModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Chat session not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    return stripDocument(doc);
  }

  async update(id: string, data: UpdateChatSessionDto, user: JwtPayload) {
    const existing = await this.chatModel.findById(id).lean();
    if (!existing) throw new NotFoundException('Chat session not found');
    this.ensureOwnerOrAdmin(existing.userId, user);

    const mapped: any = { ...data };
    if (data.messages) mapped.messages = data.messages.map(this.mapMessage);
    const doc = await this.chatModel
      .findByIdAndUpdate(id, mapped, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Chat session not found');
    return stripDocument(doc);
  }

  async addMessage(id: string, message: ChatMessageDto, user: JwtPayload) {
    const doc = await this.chatModel.findById(id);
    if (!doc) throw new NotFoundException('Chat session not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    doc.messages.push(this.mapMessage(message));
    await doc.save();
    return stripDocument(doc.toObject());
  }

  async remove(id: string, user: JwtPayload) {
    const doc = await this.chatModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Chat session not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    await this.chatModel.findByIdAndDelete(id).lean();
    return stripDocument(doc);
  }

  async removeAll(user: JwtPayload) {
    const filter =
      user.role === 'admin' ? {} : { userId: new Types.ObjectId(user.sub) };
    const result = await this.chatModel.deleteMany(filter);
    return { deletedCount: result.deletedCount };
  }

  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  private mapMessage(msg: ChatMessageDto) {
    return {
      role: msg.role,
      roleName: msg.roleName,
      content: msg.content,
      type: msg.type,
      timestamp: msg.timestamp || new Date(),
      metadata: msg.metadata,
      cards: msg.cards,
      actions: msg.actions,
    };
  }

  private ensureOwnerOrAdmin(
    ownerId: Types.ObjectId | undefined,
    user: JwtPayload,
  ) {
    if (user.role === 'admin') return;
    if (!ownerId || ownerId.toString() !== user.sub) {
      throw new ForbiddenException('Access denied');
    }
  }
}
