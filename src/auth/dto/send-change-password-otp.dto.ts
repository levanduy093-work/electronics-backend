import { IsString, MinLength } from 'class-validator';

export class SendChangePasswordOtpDto {
  @IsString()
  @MinLength(8)
  currentPassword: string;
}
