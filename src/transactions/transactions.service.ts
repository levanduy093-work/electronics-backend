import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
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
}
