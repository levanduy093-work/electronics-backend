import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { AuthService } from './auth.service';
import { RegisterOtpDto } from './dto/register-otp.dto';
import { SendResetOtpDto } from './dto/send-reset-otp.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { SendChangePasswordOtpDto } from './dto/send-change-password-otp.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('register/send-otp')
  @Throttle({ default: { limit: 5, ttl: 300 } })
  sendRegisterOtp(@Body() dto: RegisterOtpDto) {
    return this.authService.sendRegisterOtp(dto);
  }

  @Public()
  @Post('register/verify-otp')
  @Throttle({ default: { limit: 20, ttl: 300 } })
  verifyRegisterOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyRegisterOtp(dto);
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60 } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('password/reset/send-otp')
  @Throttle({ default: { limit: 5, ttl: 300 } })
  sendResetOtp(@Body() dto: SendResetOtpDto) {
    return this.authService.sendResetOtp(dto);
  }

  @Public()
  @Post('password/reset/verify-otp')
  @Throttle({ default: { limit: 10, ttl: 300 } })
  verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    return this.authService.verifyResetOtp(dto);
  }

  @Public()
  @Post('password/reset')
  @Throttle({ default: { limit: 10, ttl: 300 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('password/change/send-otp')
  @Throttle({ default: { limit: 5, ttl: 300 } })
  sendChangePasswordOtp(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendChangePasswordOtpDto,
  ) {
    return this.authService.sendChangePasswordOtp(user, dto);
  }

  @Post('password/change')
  @Throttle({ default: { limit: 10, ttl: 300 } })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, dto);
  }
}
