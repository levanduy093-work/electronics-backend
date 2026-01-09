import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
class Price {
  @Prop({ required: true })
  originalPrice: number;

  @Prop({ required: true })
  salePrice: number;
}

@Schema({ collection: 'products', timestamps: true })
export class Product {
  @Prop({ required: true })
  name: string;

  @Prop()
  category?: string;

  @Prop()
  description?: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: Map, of: String, default: {} })
  specs?: Record<string, string>;

  @Prop({ type: Price, required: true })
  price: Price;

  @Prop({ default: 0 })
  averageRating: number;

  @Prop({ default: 0 })
  reviewCount: number;

  @Prop({ default: 0 })
  saleCount: number;

  @Prop({ default: 0 })
  stock: number;

  @Prop()
  datasheet?: string;

  @Prop({ unique: true })
  code?: string;
}

export type ProductDocument = HydratedDocument<Product>;
export const PriceSchema = SchemaFactory.createForClass(Price);
export const ProductSchema = SchemaFactory.createForClass(Product);
