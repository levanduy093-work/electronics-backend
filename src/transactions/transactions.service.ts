import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
  ) {}

  async create(data: CreateTransactionDto) {
    const created = await this.transactionModel.create({
      ...data,
      orderId: new Types.ObjectId(data.orderId),
      userId: new Types.ObjectId(data.userId),
      paidAt: data.paidAt ? new Date(data.paidAt) : undefined,
    });
    return this.strip(created.toObject());
  }

  async findAll() {
    await this.backfillCodTransactions();
    const docs = await this.transactionModel.find().lean();
    return docs.map(this.strip);
  }

  async findOne(id: string) {
    const doc = await this.transactionModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Transaction not found');
    return this.strip(doc);
  }

  async update(id: string, data: UpdateTransactionDto) {
    const mapped: any = { ...data };
    if (data.orderId) mapped.orderId = new Types.ObjectId(data.orderId);
    if (data.userId) mapped.userId = new Types.ObjectId(data.userId);
    if (data.paidAt) mapped.paidAt = new Date(data.paidAt);

    const doc = await this.transactionModel
      .findByIdAndUpdate(id, mapped, { new: true, lean: true })
      .exec();
    if (!doc) throw new NotFoundException('Transaction not found');
    return this.strip(doc);
  }

  async remove(id: string) {
    const doc = await this.transactionModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Transaction not found');
    return this.strip(doc);
  }

  private strip = (doc: Partial<Transaction>) => {
    const { __v, ...rest } = doc as Partial<Transaction & { __v?: number }>;
    return rest;
  };

  private async backfillCodTransactions() {
    const codOrders = await this.orderModel
      .find({ payment: { $regex: /cod/i } }, { _id: 1, userId: 1, totalPrice: 1, paymentStatus: 1 })
      .lean();
    if (!codOrders.length) return;

    const orderIds = codOrders.map((o) => o._id);
    const existing = await this.transactionModel
      .find({ orderId: { $in: orderIds }, provider: 'cod' }, { orderId: 1 })
      .lean();
    const existingIds = new Set(existing.map((t) => t.orderId?.toString?.() || ''));

    const missing = codOrders.filter((o) => !existingIds.has(o._id?.toString?.() || ''));
    if (!missing.length) return;

    const now = new Date().toISOString();
    await Promise.all(
      missing.map((o) =>
        this.transactionModel.create({
          orderId: o._id,
          userId: o.userId,
          provider: 'cod',
          amount: o.totalPrice || 0,
          currency: 'VND',
          status: o.paymentStatus || 'pending',
          paidAt: o.paymentStatus === 'paid' ? now : undefined,
        }),
      ),
    );
  }
}
