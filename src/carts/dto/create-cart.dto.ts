import {
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CartItemDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  price: number;

  @IsOptional()
  name?: string;

  @IsOptional()
  category?: string;

  @IsOptional()
  image?: string;
}

export class CreateCartDto {
  @IsOptional()
  @IsMongoId()
  voucher?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];

  @IsOptional()
  @IsNumber()
  totalItem?: number;

  @IsOptional()
  @IsNumber()
  subTotal?: number;

  @IsOptional()
  @IsNumber()
  shippingFee?: number;

  @IsOptional()
  @IsNumber()
  totalPrice?: number;
}
