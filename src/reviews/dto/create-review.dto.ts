import { IsArray, IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateReviewDto {
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
