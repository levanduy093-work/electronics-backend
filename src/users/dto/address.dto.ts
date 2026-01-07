import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AddressDto {
  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsString()
  city: string;

  @IsString()
  district: string;

  @IsString()
  ward: string;

  @IsString()
  street: string;

  @IsString()
  type: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
