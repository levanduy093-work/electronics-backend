import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { OtpCode, OtpCodeDocument } from './schemas/otp-code.schema';

@Injectable()
export class OtpService {
  constructor(
    @InjectModel(OtpCode.name)
    private readonly otpModel: Model<OtpCodeDocument>,
    private readonly configService: ConfigService,
  ) {}

  async createCode(email: string, purpose: string) {
    const code = this.generateCode();
    const codeHashed = await bcrypt.hash(code, 10);
    const ttlSeconds = this.configService.get<number>('OTP_TTL_SECONDS') ?? 600; // 10 minutes
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Keep only the latest OTP for an email + purpose.
    await this.otpModel.deleteMany({ email: email.toLowerCase(), purpose });
    await this.otpModel.create({
      email: email.toLowerCase(),
      purpose,
      codeHashed,
      expiresAt,
      attempts: 0,
      used: false,
    });

    return { code, expiresAt };
  }

  async verifyCode(email: string, purpose: string, code: string) {
    const record = await this.otpModel
      .findOne({ email: email.toLowerCase(), purpose })
      .sort({ createdAt: -1 })
      .exec();

    const invalidError = new UnauthorizedException('Invalid or expired OTP');
    if (!record || record.used) {
      throw invalidError;
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw invalidError;
    }

    const maxAttempts = this.configService.get<number>('OTP_MAX_ATTEMPTS') ?? 5;
    if ((record.attempts ?? 0) >= maxAttempts) {
      throw invalidError;
    }

    const isMatch = await bcrypt.compare(code, record.codeHashed);
    if (!isMatch) {
      record.attempts = (record.attempts ?? 0) + 1;
      await record.save();
      throw invalidError;
    }

    record.used = true;
    await record.save();
  }

  private generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
