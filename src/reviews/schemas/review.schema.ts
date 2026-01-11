import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'reviews', timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'users', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'products', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  rating: number;

  @Prop()
  comment?: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop()
  userName?: string;
}

export type ReviewDocument = HydratedDocument<Review>;
export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
