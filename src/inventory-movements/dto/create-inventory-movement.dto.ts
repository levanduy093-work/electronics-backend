import { IsIn, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateInventoryMovementDto {
  @IsMongoId()
  productId: string;

  @IsString()
  @IsIn(['inbound', 'outbound'])
  type: string; // inbound | outbound

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  note?: string;
}
