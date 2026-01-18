import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { ChatService } from './chat.service';
import {
  CreateChatSessionDto,
  ChatMessageDto,
} from './dto/create-chat-session.dto';
import { UpdateChatSessionDto } from './dto/update-chat-session.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateChatSessionDto) {
    return this.chatService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.chatService.findAll(user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateChatSessionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.update(id, dto, user);
  }

  @Post(':id/messages')
  addMessage(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() message: ChatMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.addMessage(id, message, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.remove(id, user);
  }
}
