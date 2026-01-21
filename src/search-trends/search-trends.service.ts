import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchTrend, SearchTrendDocument } from './schemas/search-trend.schema';

@Injectable()
export class SearchTrendsService {
    constructor(
        @InjectModel(SearchTrend.name)
        private readonly searchTrendModel: Model<SearchTrendDocument>,
    ) { }

    async incrementSearch(keyword: string) {
        const normalized = keyword.trim().toLowerCase();
        if (!normalized || normalized.length < 2) return;

        await this.searchTrendModel.updateOne(
            { keyword: normalized },
            {
                $inc: { count: 1 },
                $set: { lastSearchedAt: new Date() }
            },
            { upsert: true }
        );
    }

    async getTopTrends(limit: number = 10): Promise<string[]> {
        const trends = await this.searchTrendModel
            .find()
            .sort({ count: -1, lastSearchedAt: -1 })
            .limit(limit)
            .lean();

        return trends.map(t => t.keyword);
    }
}
