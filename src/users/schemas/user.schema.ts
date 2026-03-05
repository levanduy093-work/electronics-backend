import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false })
class Address {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  district: string;

  @Prop({ required: true })
  ward: string;

  @Prop({ required: true })
  street: string;

  @Prop({ required: true })
  type: string;

  @Prop({ default: false })
  isDefault: boolean;
}

@Schema({ _id: false })
export class UserVoucher {
  @Prop({ required: true })
  code: string;

  @Prop()
  description?: string;

  @Prop({ default: 'fixed', enum: ['fixed', 'shipping', 'percentage'] })
  type: 'fixed' | 'shipping' | 'percentage';

  @Prop()
  discountPrice: number;

  @Prop()
  discountRate?: number;

  @Prop()
  maxDiscountPrice?: number;

  @Prop({ required: true })
  minTotal: number;

  @Prop({ required: true })
  expire: Date;
}

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop()
  avatar?: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop()
  passwordHashed?: string;

  @Prop({ default: 'user' })
  role: string;

  @Prop()
  provider?: string;

  @Prop()
  providerId?: string;

  @Prop({ type: [String], default: [] })
  fcmTokens: string[];

  @Prop({ type: [Address], default: [] })
  address: Address[];

  @Prop({ type: [UserVoucher], default: [] })
  voucher: UserVoucher[];

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'products', default: [] })
  favorites: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  searchHistory: string[];

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  aiChatHistory: Array<{
    id: string;
    role: 'user' | 'ai';
    content: string;
    timestamp: string;
    type?: string;
    metadata?: any;
    cards?: any[];
    orderCards?: any[];
    addressCards?: any[];
    actions?: any[];
  }>;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  aiChatArchives: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      role: 'user' | 'ai';
      content: string;
      timestamp: string;
      type?: string;
      metadata?: any;
      cards?: any[];
      orderCards?: any[];
      addressCards?: any[];
      actions?: any[];
    }>;
  }>;
}

export type UserDocument = HydratedDocument<User>;
export const AddressSchema = SchemaFactory.createForClass(Address);
export const UserSchema = SchemaFactory.createForClass(User);
