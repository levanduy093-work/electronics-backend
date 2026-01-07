import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatSession, ChatSessionDocument } from './schemas/chat-session.schema';
import { CreateChatSessionDto, ChatMessageDto } from './dto/create-chat-session.dto';
import { UpdateChatSessionDto } from './dto/update-chat-session.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatSession.name)
    private readonly chatModel: Model<ChatSessionDocument>,
  ) {}

  async create(data: CreateChatSessionDto) {
    const created = await this.chatModel.create({
      ...data,
      userId: new Types.ObjectId(data.userId),
      messages: data.messages?.map(this.mapMessage),
    });
    return this.strip(created.toObject());
  }

  async findAll() {
    const docs = await this.chatModel.find().lean();
    return docs.map(this.strip);
  }

  async findOne(id: string) {
    const doc = await this.chatModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Chat session not found');
    return this.strip(doc);
  }

  async update(id: string, data: UpdateChatSessionDto) {
    const mapped: any = { ...data };
    if (data.userId) mapped.userId = new Types.ObjectId(data.userId);
    if (data.messages) mapped.messages = data.messages.map(this.mapMessage);
    const doc = await this.chatModel
      .findByIdAndUpdate(id, mapped, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Chat session not found');
    return this.strip(doc);
  }

  async addMessage(id: string, message: ChatMessageDto) {
    const doc = await this.chatModel.findById(id);
    if (!doc) throw new NotFoundException('Chat session not found');
    doc.messages.push(this.mapMessage(message));
    await doc.save();
    return this.strip(doc.toObject());
  }

  async remove(id: string) {
    const doc = await this.chatModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Chat session not found');
    return this.strip(doc);
  }

  private mapMessage = (msg: ChatMessageDto) => ({
    ...msg,
    time: msg.time ? new Date(msg.time) : undefined,
  });

  private strip = (doc: Partial<ChatSession>) => {
    const { __v, ...rest } = doc as Partial<ChatSession & { __v?: number }>;
    return rest;
  };
}
