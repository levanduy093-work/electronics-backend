import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { AiChatDto } from './dto/ai-chat.dto';
import { AiService } from './ai.service';
import { AiConfirmDto } from './dto/ai-confirm.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  chat(@Body() dto: AiChatDto, @CurrentUser() user: JwtPayload) {
    return this.aiService.chat(dto, user);
  }

  @Post('confirm')
  confirm(@Body() dto: AiConfirmDto, @CurrentUser() user: JwtPayload) {
    return this.aiService.confirm(dto, user);
  }
}
