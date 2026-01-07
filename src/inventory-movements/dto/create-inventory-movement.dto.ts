import { IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateInventoryMovementDto {
  @IsMongoId()
  productId: string;

  @IsString()
  type: string; // inbound | outbound

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsString()
  note?: string;
}
