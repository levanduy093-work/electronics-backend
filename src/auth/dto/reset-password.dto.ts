import { IsEmail, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  resetToken: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
