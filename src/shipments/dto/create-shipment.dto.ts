import {
  IsArray,
  IsDateString,
  IsMongoId,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class StatusEntryDto {
  @IsString()
  status: string;

  @IsOptional()
  @IsDateString()
  at?: string;
}

export class CreateShipmentDto {
  @IsMongoId()
  orderId: string;

  @IsString()
  carrier: string;

  @IsString()
  trackingNumber: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatusEntryDto)
  statusHistory?: StatusEntryDto[];

  @IsOptional()
  @IsDateString()
  expectedDelivery?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;
}
