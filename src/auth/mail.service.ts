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
    const from = this.configService.get<string>('SMTP_FROM') || user || '';
    this.from = from;
    const secureFlag = this.configService.get<string>('SMTP_SECURE');
    const secure = secureFlag ? secureFlag === 'true' : port === 465;

    if (!host || !port || !user || !pass || !this.from) {
      throw new Error(
        'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM must be provided for OTP email',
      );
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

  private getEmailContent(purpose: string, code: string, expiresAt: Date) {
    const formattedExpires = new Date(expiresAt).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    let subject: string;
    let title: string;
    let description: string;
    let icon: string;
    let greeting: string;

    switch (purpose) {
      case 'register':
        subject = '🎉 Mã xác nhận đăng ký tài khoản - ElectroAI';
        title = 'Chào mừng đến với ElectroAI!';
        description =
          'Cảm ơn bạn đã tin tưởng và đăng ký tài khoản tại ElectroAI. Để hoàn tất quá trình đăng ký và bắt đầu khám phá thế giới linh kiện điện tử, vui lòng sử dụng mã xác nhận bên dưới:';
        icon = '🚀';
        greeting = 'Xin chào!';
        break;
      case 'reset-password':
        subject = '🔐 Mã xác nhận đặt lại mật khẩu - ElectroAI';
        title = 'Yêu cầu đặt lại mật khẩu';
        description =
          'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này. Nếu có, vui lòng sử dụng mã xác nhận bên dưới để tiếp tục:';
        icon = '🔑';
        greeting = 'Xin chào!';
        break;
      case 'change-password':
        subject = '🔒 Mã xác nhận đổi mật khẩu - ElectroAI';
        title = 'Xác nhận đổi mật khẩu';
        description =
          'Bạn đã yêu cầu thay đổi mật khẩu cho tài khoản của mình. Để đảm bảo an toàn, vui lòng sử dụng mã xác nhận bên dưới để hoàn tất quá trình:';
        icon = '🛡️';
        greeting = 'Xin chào!';
        break;
      default:
        subject = '📧 Mã xác nhận - ElectroAI';
        title = 'Mã xác nhận của bạn';
        description = 'Vui lòng sử dụng mã xác nhận bên dưới để tiếp tục:';
        icon = '✉️';
        greeting = 'Xin chào!';
    }

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f4f8; line-height: 1.6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0f4f8;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <!-- Main Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1); overflow: hidden;">
          
          <!-- Header với Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #3B82F6 0%, #60A5FA 50%, #93C5FD 100%); padding: 48px 40px; text-align: center;">
              <!-- Logo Icon -->
              <div style="display: inline-block; background-color: rgba(255,255,255,0.95); width: 80px; height: 80px; border-radius: 20px; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15); line-height: 80px; font-size: 40px;">
                🛒
              </div>
              
              <!-- Brand Name -->
              <h1 style="margin: 0 0 8px 0; font-size: 32px; font-weight: 800; color: #ffffff; letter-spacing: -1px; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                ElectroAI
              </h1>
              
              <!-- Tagline -->
              <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 14px; font-weight: 500; letter-spacing: 0.5px;">
                🔌 Linh kiện điện tử thông minh • Được hỗ trợ bởi AI
              </p>
            </td>
          </tr>
          
          <!-- Nội dung chính -->
          <tr>
            <td style="padding: 48px 40px 40px 40px;">
              <!-- Icon & Greeting -->
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-size: 48px; line-height: 1;">${icon}</span>
              </div>
              
              <!-- Title -->
              <h2 style="margin: 0 0 16px 0; font-size: 26px; font-weight: 700; color: #1a202c; text-align: center; letter-spacing: -0.5px;">
                ${title}
              </h2>
              
              <!-- Greeting -->
              <p style="margin: 0 0 8px 0; font-size: 16px; color: #4a5568; text-align: center; font-weight: 600;">
                ${greeting}
              </p>
              
              <!-- Description -->
              <p style="margin: 0 0 32px 0; font-size: 15px; color: #64748b; text-align: center; line-height: 1.7;">
                ${description}
              </p>
              
              <!-- Mã OTP Box -->
              <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 2px solid #e2e8f0; border-radius: 16px; padding: 32px; text-align: center; margin: 32px 0;">
                <p style="margin: 0 0 12px 0; font-size: 13px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 2px;">
                  🔐 Mã xác nhận của bạn
                </p>
                
                <!-- OTP Code -->
                <div style="display: inline-block; background: linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%); padding: 16px 32px; border-radius: 12px; box-shadow: 0 8px 24px rgba(59, 130, 246, 0.35);">
                  <p style="margin: 0; font-size: 40px; font-weight: 800; color: #ffffff; letter-spacing: 10px; font-family: 'SF Mono', 'Courier New', monospace;">
                    ${code}
                  </p>
                </div>
                
                <!-- Copy hint -->
                <p style="margin: 16px 0 0 0; font-size: 12px; color: #94a3b8;">
                  Sao chép mã này và dán vào ứng dụng
                </p>
              </div>
              
              <!-- Thông tin hết hạn -->
              <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-left: 4px solid #ef4444; padding: 16px 20px; border-radius: 8px; margin: 28px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td width="24" valign="top">
                      <span style="font-size: 18px;">⏰</span>
                    </td>
                    <td style="padding-left: 12px;">
                      <p style="margin: 0; font-size: 14px; color: #dc2626; font-weight: 600;">
                        Lưu ý quan trọng
                      </p>
                      <p style="margin: 4px 0 0 0; font-size: 13px; color: #991b1b;">
                        Mã xác nhận này sẽ hết hạn vào lúc <strong>${formattedExpires}</strong>
                      </p>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- Hướng dẫn -->
              <div style="margin-top: 32px; padding: 24px; background-color: #f8fafc; border-radius: 12px;">
                <p style="margin: 0 0 16px 0; font-size: 14px; color: #475569; text-align: center; font-weight: 700;">
                  📋 Hướng dẫn sử dụng
                </p>
                
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="padding: 10px 0;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                          <td width="32" valign="top">
                            <div style="background: linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%); color: white; width: 24px; height: 24px; border-radius: 50%; text-align: center; font-size: 12px; font-weight: bold; line-height: 24px;">1</div>
                          </td>
                          <td style="padding-left: 12px; color: #475569; font-size: 14px;">
                            Mở ứng dụng <strong>ElectroAI</strong> trên điện thoại
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                          <td width="32" valign="top">
                            <div style="background: linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%); color: white; width: 24px; height: 24px; border-radius: 50%; text-align: center; font-size: 12px; font-weight: bold; line-height: 24px;">2</div>
                          </td>
                          <td style="padding-left: 12px; color: #475569; font-size: 14px;">
                            Nhập mã xác nhận <strong style="color: #3B82F6;">${code}</strong> vào ô OTP
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                          <td width="32" valign="top">
                            <div style="background: linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%); color: white; width: 24px; height: 24px; border-radius: 50%; text-align: center; font-size: 12px; font-weight: bold; line-height: 24px;">3</div>
                          </td>
                          <td style="padding-left: 12px; color: #475569; font-size: 14px;">
                            Nhấn <strong>"Xác nhận"</strong> để hoàn tất quá trình
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- Security Notice -->
              <div style="margin-top: 24px; padding: 16px 20px; background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td width="24" valign="top">
                      <span style="font-size: 16px;">🛡️</span>
                    </td>
                    <td style="padding-left: 12px;">
                      <p style="margin: 0; font-size: 13px; color: #92400e;">
                        <strong>Bảo mật:</strong> Không chia sẻ mã này với bất kỳ ai. ElectroAI sẽ không bao giờ yêu cầu mã OTP của bạn qua điện thoại hoặc tin nhắn.
                      </p>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 32px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <!-- Contact Info -->
              <p style="margin: 0 0 16px 0; font-size: 14px; color: #64748b;">
                Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.
              </p>
              
              <!-- Contact Methods -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 20px auto;">
                <tr>
                  <td style="padding: 0 12px;">
                    <a href="mailto:levanduy.work@gmail.com" style="text-decoration: none;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="background-color: #ffffff; padding: 10px 16px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                            <span style="font-size: 14px;">📧</span>
                            <span style="font-size: 13px; color: #3B82F6; font-weight: 600; margin-left: 6px;">Email</span>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="tel:0827733475" style="text-decoration: none;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="background-color: #ffffff; padding: 10px 16px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                            <span style="font-size: 14px;">📞</span>
                            <span style="font-size: 13px; color: #3B82F6; font-weight: 600; margin-left: 6px;">Hotline</span>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="https://zalo.me/0827733475" style="text-decoration: none;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="background-color: #ffffff; padding: 10px 16px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                            <span style="font-size: 14px;">💬</span>
                            <span style="font-size: 13px; color: #3B82F6; font-weight: 600; margin-left: 6px;">Zalo</span>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Contact Details -->
              <p style="margin: 20px 0 8px 0; font-size: 13px; color: #94a3b8;">
                <strong>Hỗ trợ khách hàng:</strong>
              </p>
              <p style="margin: 0; font-size: 13px; color: #64748b;">
                📧 <a href="mailto:levanduy.work@gmail.com" style="color: #3B82F6; text-decoration: none;">levanduy.work@gmail.com</a> &nbsp;•&nbsp; 
                📞 <a href="tel:0827733475" style="color: #3B82F6; text-decoration: none;">0827 733 475</a>
              </p>
              
              <!-- Divider -->
              <div style="height: 1px; background-color: #e2e8f0; margin: 24px 0;"></div>
              
              <!-- Copyright -->
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                © ${new Date().getFullYear()} <strong>ElectroAI</strong> - Ứng dụng mua sắm linh kiện điện tử
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #cbd5e1;">
                Email này được gửi tự động, vui lòng không trả lời trực tiếp.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer Note -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px;">
          <tr>
            <td style="padding: 24px 20px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.6;">
                Bạn nhận được email này vì đã đăng ký hoặc sử dụng dịch vụ của ElectroAI.<br>
                Nếu bạn không muốn nhận email từ chúng tôi, vui lòng liên hệ hỗ trợ.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const text = `
═══════════════════════════════════════════
     ElectroAI - Linh kiện điện tử thông minh
═══════════════════════════════════════════

${icon} ${title}

${greeting}

${description}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔐 MÃ XÁC NHẬN: ${code}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏰ LƯU Ý: Mã này sẽ hết hạn vào ${formattedExpires}

📋 HƯỚNG DẪN SỬ DỤNG:
   1. Mở ứng dụng ElectroAI trên điện thoại
   2. Nhập mã xác nhận ${code} vào ô OTP
   3. Nhấn "Xác nhận" để hoàn tất

🛡️ BẢO MẬT:
   • Không chia sẻ mã này với bất kỳ ai
   • ElectroAI không bao giờ yêu cầu mã OTP qua điện thoại

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📧 Liên hệ hỗ trợ:
   • Email: levanduy.work@gmail.com
   • Hotline: 0827 733 475
   • Zalo: 0827 733 475

═══════════════════════════════════════════
© ${new Date().getFullYear()} ElectroAI. Tất cả quyền được bảo lưu.
Email này được gửi tự động, vui lòng không trả lời.
═══════════════════════════════════════════
    `.trim();

    return { subject, html, text };
  }

  async sendOtp(
    to: string,
    code: string,
    expiresAt: Date,
    purpose: string = 'default',
  ) {
    const { subject, html, text } = this.getEmailContent(
      purpose,
      code,
      expiresAt,
    );

    await this.transporter.sendMail({
      from: `ElectroAI <${this.from}>`,
      to,
      subject,
      text,
      html,
    });
  }
}
