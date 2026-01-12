import { Type } from 'class-transformer';
import { IsArray, IsMongoId, IsNumber, ValidateNested } from 'class-validator';

class BannerOrderDto {
  @IsMongoId()
  id: string;

  @IsNumber()
  order: number;
}

export class ReorderBannersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BannerOrderDto)
  items: BannerOrderDto[];
}
