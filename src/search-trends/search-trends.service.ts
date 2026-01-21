import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchTrend, SearchTrendDocument } from './schemas/search-trend.schema';

export interface TrendWithCount {
    keyword: string;
    count: number;
    lastSearchedAt: Date;
}

@Injectable()
export class SearchTrendsService {
    constructor(
        @InjectModel(SearchTrend.name)
        private readonly searchTrendModel: Model<SearchTrendDocument>,
    ) { }

    /**
     * Increment search count for a single keyword
     */
    async incrementSearch(keyword: string): Promise<void> {
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

    /**
     * Batch increment search counts for multiple keywords
     */
    async incrementSearchBatch(keywords: string[]): Promise<void> {
        const operations = keywords
            .map(k => k.trim().toLowerCase())
            .filter(k => k && k.length >= 2)
            .map(keyword => ({
                updateOne: {
                    filter: { keyword },
                    update: {
                        $inc: { count: 1 },
                        $set: { lastSearchedAt: new Date() }
                    },
                    upsert: true
                }
            }));

        if (operations.length > 0) {
            await this.searchTrendModel.bulkWrite(operations);
        }
    }

    /**
     * Get top trending keywords
     */
    async getTopTrends(limit: number = 10): Promise<string[]> {
        const trends = await this.searchTrendModel
            .find()
            .sort({ count: -1, lastSearchedAt: -1 })
            .limit(limit)
            .lean();

        return trends.map(t => t.keyword);
    }

    /**
     * Get top trending keywords with counts (for admin dashboard)
     */
    async getTopTrendsWithCount(limit: number = 10): Promise<TrendWithCount[]> {
        const trends = await this.searchTrendModel
            .find()
            .sort({ count: -1, lastSearchedAt: -1 })
            .limit(limit)
            .lean();

        return trends.map(t => ({
            keyword: t.keyword,
            count: t.count,
            lastSearchedAt: t.lastSearchedAt,
        }));
    }

    /**
     * Get all trends (for admin dashboard)
     */
    async getAllTrends(skip: number = 0, limit: number = 50): Promise<{ trends: TrendWithCount[]; total: number }> {
        const [trends, total] = await Promise.all([
            this.searchTrendModel
                .find()
                .sort({ count: -1, lastSearchedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            this.searchTrendModel.countDocuments()
        ]);

        return {
            trends: trends.map(t => ({
                keyword: t.keyword,
                count: t.count,
                lastSearchedAt: t.lastSearchedAt,
            })),
            total
        };
    }

    /**
     * Clear old trends (older than specified days)
     */
    async clearOldTrends(daysOld: number = 90): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await this.searchTrendModel.deleteMany({
            lastSearchedAt: { $lt: cutoffDate },
            count: { $lt: 5 } // Only delete trends with low count
        });

        return result.deletedCount;
    }
}
