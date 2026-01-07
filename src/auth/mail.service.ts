import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<number>('SMTP_PORT'));
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.from = this.configService.get<string>('SMTP_FROM') ?? user;
    const secureFlag = this.configService.get<string>('SMTP_SECURE');
    const secure = secureFlag ? secureFlag === 'true' : port === 465;

    if (!host || !port || !user || !pass || !this.from) {
      throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM must be provided for OTP email');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  async sendOtp(to: string, code: string, expiresAt: Date) {
    const formattedExpires = expiresAt.toISOString();
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Your OTP code',
      text: `Your verification code is ${code}. It expires at ${formattedExpires}.`,
      html: `<p>Your verification code is <strong>${code}</strong>.</p><p>This code expires at ${formattedExpires}.</p>`,
    });
  }
}
