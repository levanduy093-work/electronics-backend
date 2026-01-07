import { IsDateString, IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTransactionDto {
  @IsMongoId()
  orderId: string;

  @IsMongoId()
  userId: string;

  @IsString()
  provider: string;

  @IsNumber()
  amount: number;

  @IsString()
  currency: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
