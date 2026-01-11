import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac } from 'crypto';
import { Model, Types } from 'mongoose';
import { JwtPayload } from '../common/types/jwt-payload';
import { CreateVnpayPaymentDto } from './dto/create-vnpay-payment.dto';
import { OrdersService } from '../orders/orders.service';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { Transaction, TransactionDocument } from '../transactions/schemas/transaction.schema';

type VnpayConfig = {
  tmnCode: string;
  hashSecret: string;
  url: string;
  returnUrl: string;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly transactionsService: TransactionsService,
    private readonly configService: ConfigService,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async createVnpayPayment(dto: CreateVnpayPaymentDto, user: JwtPayload, clientIp: string) {
    const config = this.getVnpayConfig();
    const payload = {
      ...dto,
      payment: 'VNPAY',
      paymentStatus: 'pending',
      status: dto.status?.ordered ? dto.status : { ...(dto.status || {}), ordered: new Date().toISOString() },
    };

    const order = await this.ordersService.create(payload, user);
    const orderId = (order as any)._id?.toString?.();
    if (!orderId) {
      throw new BadRequestException('Không xác định được mã đơn hàng để khởi tạo thanh toán');
    }
    const txnRef = order.code || orderId;
    const amount = Number((order as any).totalPrice || dto.totalPrice);

    const vnpParams = this.buildVnpParams({
      amount,
      bankCode: dto.bankCode,
      clientIp: clientIp || '127.0.0.1',
      locale: dto.locale,
      orderDescription: `Thanh toan don hang ${txnRef}`,
      returnUrl: config.returnUrl,
      tmnCode: config.tmnCode,
      txnRef,
    });
    const secureHash = this.buildSecureHash(vnpParams, config.hashSecret);
    const paymentUrl = `${config.url}?${this.toQueryString({ ...vnpParams, vnp_SecureHash: secureHash })}`;

    const transaction = await this.transactionsService.create({
      orderId: orderId || '',
      userId: user.sub,
      provider: 'vnpay',
      amount,
      currency: 'VND',
      status: 'pending',
    });

    return {
      paymentUrl,
      order,
      transactionId: transaction ? (transaction as any)._id?.toString() : undefined,
      paymentCode: txnRef,
    };
  }

  async handleVnpayReturn(query: Record<string, string>) {
    const config = this.getVnpayConfig();
    if (!this.verifySignature(query, config.hashSecret)) {
      return { code: '97', message: 'Checksum failed' };
    }

    const order = await this.findOrderByRef(query['vnp_TxnRef']);
    if (!order) {
      return { code: '01', message: 'Order not found' };
    }

    const status = query['vnp_ResponseCode'] === '00' ? 'paid' : 'failed';
    const amount = Number(query['vnp_Amount'] || 0) / 100;
    await this.markPayment(order, status, this.parseVnpDate(query['vnp_PayDate']));

    return {
      code: query['vnp_ResponseCode'],
      orderCode: order.code,
      status,
      amount,
    };
  }

  async handleVnpayIpn(query: Record<string, string>) {
    const config = this.getVnpayConfig();
    if (!this.verifySignature(query, config.hashSecret)) {
      return { RspCode: '97', Message: 'Checksum failed' };
    }

    const order = await this.findOrderByRef(query['vnp_TxnRef']);
    if (!order) return { RspCode: '01', Message: 'Order not found' };

    const amount = Number(query['vnp_Amount'] || 0) / 100;
    if (Number(order.totalPrice || 0) !== amount) {
      return { RspCode: '04', Message: 'Amount invalid' };
    }

    if (order.paymentStatus === 'paid') {
      return { RspCode: '02', Message: 'This order has been updated to the payment status' };
    }

    const status = query['vnp_ResponseCode'] === '00' ? 'paid' : 'failed';
    await this.markPayment(order, status, this.parseVnpDate(query['vnp_PayDate']));

    return { RspCode: '00', Message: 'Success' };
  }

  private getVnpayConfig(): VnpayConfig {
    const tmnCode = this.configService.get<string>('VNP_TMN_CODE');
    const hashSecret = this.configService.get<string>('VNP_HASH_SECRET');
    if (!tmnCode || !hashSecret) {
      throw new BadRequestException('VNPAY configuration is missing');
    }

    return {
      tmnCode,
      hashSecret,
      url: this.configService.get<string>('VNP_URL') || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      returnUrl:
        this.configService.get<string>('VNP_RETURN_URL') ||
        `${this.configService.get<string>('APP_URL') || 'http://localhost:3000'}/payments/vnpay/return`,
    };
  }

  private buildVnpParams(input: {
    amount: number;
    bankCode?: string;
    clientIp: string;
    locale?: string;
    orderDescription: string;
    returnUrl: string;
    tmnCode: string;
    txnRef: string;
  }) {
    const now = new Date();
    const formatDate = (value: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}${pad(
        value.getHours(),
      )}${pad(value.getMinutes())}${pad(value.getSeconds())}`;
    };

    const params: Record<string, string | number> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: input.tmnCode,
      vnp_Locale: input.locale || 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: input.orderDescription,
      vnp_OrderType: 'other',
      vnp_Amount: Math.round(input.amount * 100),
      vnp_ReturnUrl: input.returnUrl,
      vnp_IpAddr: input.clientIp,
      vnp_CreateDate: formatDate(now),
    };

    if (input.bankCode) {
      params['vnp_BankCode'] = input.bankCode;
    }

    return params;
  }

  private toQueryString(params: Record<string, string | number>) {
    return Object.keys(params)
      .sort()
      .map((key) => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
      .join('&');
  }

  private buildSecureHash(params: Record<string, string | number>, hashSecret: string) {
    const signData = this.toQueryString(params);
    return createHmac('sha512', hashSecret).update(Buffer.from(signData, 'utf-8')).digest('hex');
  }

  private verifySignature(query: Record<string, string>, hashSecret: string) {
    const secureHash = query['vnp_SecureHash'];
    const cloned = { ...query };
    delete cloned['vnp_SecureHash'];
    delete cloned['vnp_SecureHashType'];

    const calculated = this.buildSecureHash(cloned, hashSecret);
    return secureHash === calculated;
  }

  private async findOrderByRef(ref: string | undefined | null) {
    if (!ref) return null;
    let order = await this.orderModel.findOne({ code: ref }).lean();
    if (!order && Types.ObjectId.isValid(ref)) {
      order = await this.orderModel.findById(ref).lean();
    }
    return order;
  }

  private async markPayment(order: Partial<Order>, status: string, paidAt?: Date) {
    const orderId = (order as any)._id?.toString?.() || (order as any).id || (order as any)._id;
    if (!orderId) return;

    await this.orderModel.findByIdAndUpdate(orderId, { paymentStatus: status }).lean();

    const orderUserId = (order as any).userId;
    const orderAmount = (order as any).totalPrice || 0;
    const existing = await this.transactionModel
      .findOne({ orderId: new Types.ObjectId(orderId), provider: 'vnpay' })
      .lean();

    if (existing?._id) {
      await this.transactionModel.findByIdAndUpdate(existing._id, { status, paidAt }, { lean: true }).exec();
    } else {
      await this.transactionModel.create({
        orderId: new Types.ObjectId(orderId),
        userId: orderUserId ? new Types.ObjectId(orderUserId) : undefined,
        provider: 'vnpay',
        amount: orderAmount,
        currency: 'VND',
        status,
        paidAt,
      });
    }
  }

  private parseVnpDate(value?: string) {
    if (!value || value.length < 14) return undefined;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const date = Number(value.slice(6, 8));
    const hour = Number(value.slice(8, 10));
    const minute = Number(value.slice(10, 12));
    const second = Number(value.slice(12, 14));
    return new Date(Date.UTC(year, month, date, hour - 7, minute, second));
  }
}
