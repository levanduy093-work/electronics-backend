import { Transform } from 'class-transformer';
import { IsNotEmpty, IsUrl } from 'class-validator';

export class UploadImageByUrlDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @IsNotEmpty()
  url: string;
}
