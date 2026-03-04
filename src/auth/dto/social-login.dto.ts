import { IsString, IsNotEmpty } from 'class-validator';

export class SocialLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @IsString()
  @IsNotEmpty()
  provider: 'google' | 'apple';
}
