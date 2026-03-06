import { IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AddCartItemDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  selectedOption?: string;

  @IsOptional()
  @IsString()
  selectedClassification?: string;
}
