import {
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AiConfirmDto {
  @IsString()
  confirmationId: string;

  @IsOptional()
  @IsMongoId()
  productId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}
