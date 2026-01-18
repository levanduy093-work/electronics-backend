import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateVoucherDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['fixed', 'shipping', 'percentage'])
  type?: 'fixed' | 'shipping' | 'percentage';

  @IsOptional()
  @IsNumber()
  discountPrice?: number;

  @IsOptional()
  @IsNumber()
  discountRate?: number;

  @IsOptional()
  @IsNumber()
  maxDiscountPrice?: number;

  @IsNumber()
  minTotal: number;

  @IsDateString()
  expire: string;
}
