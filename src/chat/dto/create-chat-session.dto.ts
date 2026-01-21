import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';



export class ChatMessageDto {
  @IsString()
  role: string;

  @IsOptional()
  @IsString()
  roleName?: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  timestamp?: Date;

  @IsOptional()
  metadata?: any;

  @IsOptional()
  cards?: any[];

  @IsOptional()
  actions?: any[];
}

export class CreateChatSessionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages?: ChatMessageDto[];
}
