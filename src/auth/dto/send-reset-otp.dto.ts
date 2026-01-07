import { IsEmail } from 'class-validator';

export class SendResetOtpDto {
  @IsEmail()
  email: string;
}
