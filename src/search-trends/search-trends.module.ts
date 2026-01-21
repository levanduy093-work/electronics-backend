import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchTrend, SearchTrendSchema } from './schemas/search-trend.schema';
import { SearchTrendsService } from './search-trends.service';
import { SearchTrendsController } from './search-trends.controller';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: SearchTrend.name, schema: SearchTrendSchema }]),
    ],
    controllers: [SearchTrendsController],
    providers: [SearchTrendsService],
    exports: [SearchTrendsService],
})
export class SearchTrendsModule { }
