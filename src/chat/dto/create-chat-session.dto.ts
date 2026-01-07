import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class MessageContentDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

export class ChatMessageDto {
  @IsString()
  role: string;

  @IsOptional()
  @IsDateString()
  time?: string;

  @ValidateNested()
  @Type(() => MessageContentDto)
  content: MessageContentDto;
}

export class CreateChatSessionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages?: ChatMessageDto[];
}
