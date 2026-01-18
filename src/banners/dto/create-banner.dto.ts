import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateBannerDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsUrl({ require_protocol: true })
  imageUrl: string;

  @IsString()
  @IsOptional()
  ctaLabel?: string;

  @IsString()
  @IsOptional()
  ctaLink?: string;

  @IsMongoId()
  @IsOptional()
  productId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  order?: number;
}
