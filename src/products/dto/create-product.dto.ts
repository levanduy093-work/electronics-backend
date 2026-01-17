import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

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
  @IsObject()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'object') return undefined;
    // Normalize spec values to string
    const entries = Object.entries(value as Record<string, any>)
      .map(([k, v]) => [k, v === null || v === undefined ? '' : String(v).trim()])
      .filter(([k, v]) => k && v);
    return Object.fromEntries(entries);
  })
  specs?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  classifications?: string[];

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
