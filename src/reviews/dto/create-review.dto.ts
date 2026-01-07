import { IsArray, IsMongoId, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ReviewUserDto {
  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateReviewDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewUserDto)
  user?: ReviewUserDto;

  @IsMongoId()
  productId: string;

  @IsNumber()
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
