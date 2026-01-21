import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SearchTrendDocument = HydratedDocument<SearchTrend>;

@Schema({ collection: 'search_trends', timestamps: true })
export class SearchTrend {
    @Prop({ required: true, unique: true, index: true })
    keyword: string;

    @Prop({ default: 1 })
    count: number;

    @Prop({ default: Date.now })
    lastSearchedAt: Date;
}

export const SearchTrendSchema = SchemaFactory.createForClass(SearchTrend);
