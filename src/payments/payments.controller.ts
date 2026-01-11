import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { CreateVnpayPaymentDto } from './dto/create-vnpay-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('vnpay')
  createVnpayPayment(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVnpayPaymentDto,
    @Req() req: Request,
  ) {
    const ipAddr =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';
    return this.paymentsService.createVnpayPayment(dto, user, ipAddr);
  }

  @Get('vnpay/return')
  @Public()
  async handleReturn(@Query() query: Record<string, string>, @Res() res: Response) {
    const result = await this.paymentsService.handleVnpayReturn(query);
    const success = result.status === 'paid' && result.code === '00';
    const template = this.renderReturnPage({
      success,
      orderCode: result.orderCode,
      amount: result.amount,
      message: success ? 'Thanh toán thành công' : 'Thanh toán không thành công',
    });
    res.status(200).send(template);
  }

  @Get('vnpay/ipn')
  @Public()
  handleIpn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayIpn(query);
  }

  private renderReturnPage(payload: { success: boolean; orderCode?: string; amount?: number; message: string }) {
    const statusColor = payload.success ? '#16a34a' : '#ef4444';
    const amountText =
      payload.amount && Number.isFinite(payload.amount)
        ? payload.amount.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })
        : '';
    const deepLink = payload.orderCode
      ? `electronicsshop://payment/return?order=${encodeURIComponent(payload.orderCode)}&status=${payload.success ? 'paid' : 'failed'}`
      : 'electronicsshop://payment/return';

    return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kết quả thanh toán</title>
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f8fafc; margin:0; padding:0; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#fff; padding:24px; border-radius:16px; box-shadow:0 10px 40px rgba(0,0,0,0.08); width:90%; max-width:420px; text-align:center; }
    .icon { width:72px; height:72px; border-radius:36px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px; background:${payload.success ? '#dcfce7' : '#fee2e2'}; color:${statusColor}; font-size:32px; }
    h1 { margin:8px 0 4px; font-size:22px; color:#0f172a; }
    p { margin:4px 0; color:#475569; }
    .order { margin-top:12px; font-weight:600; color:#0f172a; }
    .btn { display:block; margin-top:18px; padding:12px 14px; border-radius:12px; text-decoration:none; font-weight:700; color:#fff; background:${statusColor}; }
    .link { display:block; margin-top:10px; color:#2563eb; text-decoration:none; font-size:14px; }
  </style>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.location.href = '${deepLink}';
      }, 600);
    });
  </script>
</head>
<body>
  <div class="card">
    <div class="icon">${payload.success ? '✓' : '!'}</div>
    <h1>${payload.message}</h1>
    ${payload.orderCode ? `<p class="order">Đơn hàng #${payload.orderCode}</p>` : ''}
    ${amountText ? `<p>${amountText}</p>` : ''}
    <a class="btn" href="${deepLink}">Mở lại ứng dụng</a>
    <a class="link" href="javascript:window.close();">Đóng</a>
  </div>
</body>
</html>
`;
  }
}
