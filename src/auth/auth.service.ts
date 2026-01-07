import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
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
    const token = this.signToken(user._id?.toString() ?? '', user.email, user.role);
    return { user, accessToken: token };
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
    const token = this.signToken(user._id?.toString() ?? '', user.email, user.role);
    const { passwordHashed, __v, ...safeUser } = user as any;
    return { user: safeUser, accessToken: token };
  }

  private signToken(userId: string, email: string, role?: string) {
    return this.jwtService.sign({
      sub: userId,
      email,
      role,
    });
  }
}
