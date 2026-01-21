import {
    Controller,
    Get,
    Post,
    Delete,
    Query,
    Body,
    UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SearchTrendsService } from './search-trends.service';

@Controller('search-trends')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SearchTrendsController {
    constructor(private readonly searchTrendsService: SearchTrendsService) { }

    /**
     * Increment search trend count (public endpoint - fire and forget)
     * Called when user searches and clicks on a product
     */
    @Post('increment')
    @Public()
    async incrementTrend(@Body() body: { keyword: string }) {
        if (!body.keyword || body.keyword.trim().length < 2) {
            return { success: false, message: 'Keyword must be at least 2 characters' };
        }
        
        // Fire and forget - don't wait, return immediately
        this.searchTrendsService.incrementSearch(body.keyword).catch(err => {
            console.warn('Failed to increment search trend:', err);
        });
        
        return { success: true };
    }

    /**
     * Get top trending searches (public endpoint)
     */
    @Get()
    @Public()
    getTopTrends(@Query('limit') limit?: string) {
        const parsedLimit = limit ? parseInt(limit, 10) : 10;
        return this.searchTrendsService.getTopTrends(Math.min(parsedLimit, 50));
    }

    /**
     * Get top trending searches with counts (admin only)
     */
    @Get('with-count')
    @Roles('admin')
    getTopTrendsWithCount(@Query('limit') limit?: string) {
        const parsedLimit = limit ? parseInt(limit, 10) : 10;
        return this.searchTrendsService.getTopTrendsWithCount(Math.min(parsedLimit, 50));
    }

    /**
     * Get all trends with pagination (admin only)
     */
    @Get('all')
    @Roles('admin')
    getAllTrends(
        @Query('skip') skip?: string,
        @Query('limit') limit?: string,
    ) {
        const parsedSkip = skip ? parseInt(skip, 10) : 0;
        const parsedLimit = limit ? parseInt(limit, 10) : 50;
        return this.searchTrendsService.getAllTrends(parsedSkip, Math.min(parsedLimit, 100));
    }

    /**
     * Clear old trends (admin only)
     */
    @Delete('old')
    @Roles('admin')
    clearOldTrends(@Query('daysOld') daysOld?: string) {
        const parsedDays = daysOld ? parseInt(daysOld, 10) : 90;
        return this.searchTrendsService.clearOldTrends(parsedDays);
    }
}
