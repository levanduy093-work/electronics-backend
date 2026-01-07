import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtPayload } from '../common/types/jwt-payload';
import { ChatSession, ChatSessionDocument } from './schemas/chat-session.schema';
import { CreateChatSessionDto, ChatMessageDto } from './dto/create-chat-session.dto';
import { UpdateChatSessionDto } from './dto/update-chat-session.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatSession.name)
    private readonly chatModel: Model<ChatSessionDocument>,
  ) {}

  async create(data: CreateChatSessionDto, user: JwtPayload) {
    const created = await this.chatModel.create({
      ...data,
      userId: new Types.ObjectId(user.sub),
      messages: data.messages?.map(this.mapMessage),
    });
    return this.strip(created.toObject());
  }

  async findAll(user: JwtPayload) {
    const filter = user.role === 'admin' ? {} : { userId: new Types.ObjectId(user.sub) };
    const docs = await this.chatModel.find(filter).lean();
    return docs.map(this.strip);
  }

  async findOne(id: string, user: JwtPayload) {
    const doc = await this.chatModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Chat session not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    return this.strip(doc);
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
    return this.strip(doc);
  }

  async addMessage(id: string, message: ChatMessageDto, user: JwtPayload) {
    const doc = await this.chatModel.findById(id);
    if (!doc) throw new NotFoundException('Chat session not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    doc.messages.push(this.mapMessage(message));
    await doc.save();
    return this.strip(doc.toObject());
  }

  async remove(id: string, user: JwtPayload) {
    const doc = await this.chatModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Chat session not found');
    this.ensureOwnerOrAdmin(doc.userId, user);
    await this.chatModel.findByIdAndDelete(id).lean();
    return this.strip(doc);
  }

  private mapMessage = (msg: ChatMessageDto) => ({
    ...msg,
    time: msg.time ? new Date(msg.time) : undefined,
  });

  private ensureOwnerOrAdmin(ownerId: Types.ObjectId | undefined, user: JwtPayload) {
    if (user.role === 'admin') return;
    if (!ownerId || ownerId.toString() !== user.sub) {
      throw new ForbiddenException('Access denied');
    }
  }

  private strip = (doc: Partial<ChatSession>) => {
    const { __v, ...rest } = doc as Partial<ChatSession & { __v?: number }>;
    return rest;
  };
}
