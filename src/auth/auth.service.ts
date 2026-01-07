import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpService } from './otp.service';
import { MailService } from './mail.service';
import { RegisterOtpDto } from './dto/register-otp.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      avatar: dto.avatar,
      address: dto.address,
    });
    const userId = (user as any)._id?.toString?.() ?? '';
    const tokens = this.signTokens(userId, user.email ?? '', user.role);
    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isValid = await this.usersService.comparePassword(user, dto.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const userId = (user as any)._id?.toString?.() ?? '';
    const tokens = this.signTokens(userId, user.email ?? '', user.role);
    return { user: this.toSafeUser(user), ...tokens };
  }

  async refresh(dto: RefreshTokenDto) {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const user = await this.usersService.findByIdRaw(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const userId = (user as any)._id?.toString?.() ?? '';
    const tokens = this.signTokens(userId, user.email ?? '', user.role);
    return { user: this.toSafeUser(user), ...tokens };
  }

  async sendRegisterOtp(dto: RegisterOtpDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHashed = await bcrypt.hash(dto.password, 10);
    const payload = {
      name: dto.name ?? dto.email,
      email: dto.email.toLowerCase(),
      passwordHashed,
    };
    const { code, expiresAt } = await this.otpService.createCode(dto.email, 'register', payload);
    await this.mailService.sendOtp(dto.email, code, expiresAt);
    return { message: 'OTP has been sent to your email' };
  }

  async verifyRegisterOtp(dto: VerifyOtpDto) {
    const payload = await this.otpService.verifyCode(dto.email, 'register', dto.code);
    if (!payload?.passwordHashed) {
      throw new UnauthorizedException('Invalid OTP payload');
    }
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.usersService.createWithHashedPassword({
      name: payload.name ?? dto.email,
      email: payload.email ?? dto.email.toLowerCase(),
      passwordHashed: payload.passwordHashed,
      avatar: payload.avatar,
      address: payload.address ?? [],
      role: payload.role ?? 'customer',
    });
    const userId = (user as any)._id?.toString?.() ?? '';
    const tokens = this.signTokens(userId, user.email ?? '', user.role);
    return { user: this.toSafeUser(user), ...tokens };
  }

  private signTokens(userId: string, email: string, role?: string) {
    const refreshSecret = this.configService.get<string>('REFRESH_SECRET');
    if (!refreshSecret) {
      throw new Error('REFRESH_SECRET must be provided');
    }
    const payload = { sub: userId, email, role };
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '30m' }),
      refreshToken: this.jwtService.sign(payload, { secret: refreshSecret, expiresIn: '30d' }),
    };
  }

  private async verifyRefreshToken(token: string) {
    const refreshSecret = this.configService.get<string>('REFRESH_SECRET');
    if (!refreshSecret) {
      throw new Error('REFRESH_SECRET must be provided');
    }
    try {
      return this.jwtService.verifyAsync<{ sub: string; email: string; role?: string }>(token, {
        secret: refreshSecret,
      });
    } catch (_err) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private toSafeUser(user: any) {
    const { passwordHashed, __v, ...safeUser } = user as any;
    return safeUser;
  }
}
