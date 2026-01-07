import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateVoucherDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  discountPrice: number;

  @IsNumber()
  minTotal: number;

  @IsDateString()
  expire: string;
}
