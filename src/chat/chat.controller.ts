import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ChatService } from './chat.service';
import { CreateChatSessionDto, ChatMessageDto } from './dto/create-chat-session.dto';
import { UpdateChatSessionDto } from './dto/update-chat-session.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  create(@Body() dto: CreateChatSessionDto) {
    return this.chatService.create(dto);
  }

  @Get()
  findAll() {
    return this.chatService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.chatService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateChatSessionDto) {
    return this.chatService.update(id, dto);
  }

  @Post(':id/messages')
  addMessage(@Param('id', ParseObjectIdPipe) id: string, @Body() message: ChatMessageDto) {
    return this.chatService.addMessage(id, message);
  }

  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.chatService.remove(id);
  }
}
