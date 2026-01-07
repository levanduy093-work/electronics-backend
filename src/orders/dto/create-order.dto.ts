import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderStatusDto {
  @IsOptional()
  @IsDateString()
  ordered?: string;

  @IsOptional()
  @IsDateString()
  confirmed?: string;

  @IsOptional()
  @IsDateString()
  packaged?: string;

  @IsOptional()
  @IsDateString()
  shipped?: string;
}

class ShippingAddressDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsOptional()
  @IsString()
  street?: string;
}

class OrderItemDto {
  @IsMongoId()
  productId: string;

  @IsString()
  name: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  price: number;

  @IsNumber()
  subTotal: number;

  @IsOptional()
  @IsNumber()
  shippingFee?: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsNumber()
  totalPrice: number;
}

export class CreateOrderDto {
  @IsString()
  code: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OrderStatusDto)
  status?: OrderStatusDto;

  @IsOptional()
  @IsBoolean()
  isCancelled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsMongoId()
  voucher?: string;

  @IsNumber()
  subTotal: number;

  @IsNumber()
  shippingFee: number;

  @IsNumber()
  discount: number;

  @IsNumber()
  totalPrice: number;

  @IsOptional()
  @IsString()
  payment?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;
}
