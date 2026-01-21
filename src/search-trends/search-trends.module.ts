import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchTrend, SearchTrendSchema } from './schemas/search-trend.schema';
import { SearchTrendsService } from './search-trends.service';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: SearchTrend.name, schema: SearchTrendSchema }]),
    ],
    providers: [SearchTrendsService],
    exports: [SearchTrendsService],
})
export class SearchTrendsModule { }
