import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
class MessageContent {
  @Prop()
  text?: string;

  @Prop({ type: [String], default: [] })
  images: string[];
}

@Schema({ _id: false })
class ChatMessage {
  @Prop({ required: true })
  role: string; // user | support

  @Prop()
  time?: Date;

  @Prop({ type: MessageContent })
  content: MessageContent;
}

@Schema({ collection: 'chat_session', timestamps: true })
export class ChatSession {
  @Prop({ type: Types.ObjectId, ref: 'users', required: true })
  userId: Types.ObjectId;

  @Prop({ type: [ChatMessage], default: [] })
  messages: ChatMessage[];
}

export type ChatSessionDocument = HydratedDocument<ChatSession>;
export const MessageContentSchema = SchemaFactory.createForClass(MessageContent);
export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
