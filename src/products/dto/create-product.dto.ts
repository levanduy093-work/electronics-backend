import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SpecsDto {
  @IsOptional()
  @IsString()
  resistance?: string;

  @IsOptional()
  @IsString()
  tolerance?: string;

  @IsOptional()
  @IsString()
  power?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  voltage?: string;
}

class PriceDto {
  @IsNumber()
  originalPrice: number;

  @IsNumber()
  salePrice: number;
}

export class CreateProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SpecsDto)
  specs?: SpecsDto;

  @ValidateNested()
  @Type(() => PriceDto)
  price: PriceDto;

  @IsOptional()
  @IsNumber()
  averageRating?: number;

  @IsOptional()
  @IsNumber()
  reviewCount?: number;

  @IsOptional()
  @IsNumber()
  saleCount?: number;

  @IsOptional()
  @IsNumber()
  stock?: number;

  @IsOptional()
  @IsString()
  datasheet?: string;

  @IsOptional()
  @IsString()
  code?: string;
}
