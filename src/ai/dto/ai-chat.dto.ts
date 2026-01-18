import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AiChatHistoryItemDto {
  @IsIn(['user', 'ai'])
  role: 'user' | 'ai';

  @IsString()
  @MaxLength(4000)
  content: string;
}

export class AiChatDto {
  @IsString()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiChatHistoryItemDto)
  history?: AiChatHistoryItemDto[];
}
