import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';



@Schema({ _id: false })
class ChatMessage {
  @Prop({ required: true })
  role: string; // user | ai

  @Prop()
  roleName?: string;

  @Prop()
  content: string;

  @Prop()
  type?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ type: [Object] })
  cards?: Record<string, any>[];

  @Prop({ type: [Object] })
  actions?: Record<string, any>[];

  @Prop()
  timestamp: Date;
}

@Schema({ collection: 'chat_session', timestamps: true })
export class ChatSession {
  @Prop({ type: Types.ObjectId, ref: 'users', required: true })
  userId: Types.ObjectId;

  @Prop({ type: [ChatMessage], default: [] })
  messages: ChatMessage[];
}

export type ChatSessionDocument = HydratedDocument<ChatSession>;

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
