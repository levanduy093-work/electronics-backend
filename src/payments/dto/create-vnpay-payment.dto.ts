import { IsOptional, IsString } from 'class-validator';
import { CreateOrderDto } from '../../orders/dto/create-order.dto';

export class CreateVnpayPaymentDto extends CreateOrderDto {
  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
