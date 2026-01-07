import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
class ReviewUser {
  @Prop()
  avatar?: string;

  @Prop()
  name?: string;
}

@Schema({ collection: 'reviews', timestamps: true })
export class Review {
  @Prop({ type: ReviewUser })
  user?: ReviewUser;

  @Prop({ type: Types.ObjectId, ref: 'products', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  rating: number;

  @Prop()
  comment?: string;

  @Prop({ type: [String], default: [] })
  images: string[];
}

export type ReviewDocument = HydratedDocument<Review>;
export const ReviewUserSchema = SchemaFactory.createForClass(ReviewUser);
export const ReviewSchema = SchemaFactory.createForClass(Review);
