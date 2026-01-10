import { IsDateString, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateVoucherDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['fixed', 'shipping'])
  type?: 'fixed' | 'shipping';

  @IsNumber()
  discountPrice: number;

  @IsNumber()
  minTotal: number;

  @IsDateString()
  expire: string;
}
